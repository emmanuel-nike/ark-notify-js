import { resolveBaseUrl } from './config'
import type {
  ArkNotifySSEConfig,
  ConnectedMessage,
  EventMessage,
  PresenceMessage,
  ServerMessage,
} from './types'
import { isPrivateChannel, appendQueryParams, resolveValue } from './utils'

type SSEEventMap = {
  connected: (message: ConnectedMessage) => void
  event: (message: EventMessage) => void
  presence: (message: PresenceMessage) => void
  message: (message: ServerMessage) => void
  error: (error: Error) => void
  close: () => void
}

type SSEEventName = keyof SSEEventMap

export class ArkNotifySSE {
  private readonly config: ArkNotifySSEConfig & { baseUrl: string }
  private es: EventSource | null = null
  private connectionId: string | null = null
  private readonly listeners = new Map<SSEEventName, Set<SSEEventMap[SSEEventName]>>()
  private readonly EventSourceCtor: typeof EventSource

  constructor(config: ArkNotifySSEConfig) {
    this.config = { ...config, baseUrl: resolveBaseUrl(config.baseUrl) }
    this.EventSourceCtor = config.EventSource ?? globalThis.EventSource
  }

  getConnectionId(): string | null {
    return this.connectionId
  }

  on<E extends SSEEventName>(event: E, handler: SSEEventMap[E]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off<E extends SSEEventName>(event: E, handler: SSEEventMap[E]): void {
    this.listeners.get(event)?.delete(handler)
  }

  private emit<E extends SSEEventName>(event: E, ...args: Parameters<SSEEventMap[E]>): void {
    for (const handler of this.listeners.get(event) ?? []) {
      ;(handler as (...a: Parameters<SSEEventMap[E]>) => void)(...args)
    }
  }

  async connect(): Promise<void> {
    if (this.es) return

    const base = this.config.baseUrl.replace(/\/$/, '')
    const authMap = this.config.auth ? { ...this.config.auth } : {}

    const privateChannels = this.config.channels.filter(isPrivateChannel)
    if (privateChannels.length > 0 && this.config.onPrivateChannelAuth && !this.config.auth) {
      // Private SSE channels need auth tokens in the query before connect.
      // Fetch tokens server-side and pass them via the `auth` option, or use WebSocket instead.
    }

    const token = resolveValue(this.config.token)
    const streamUrl = appendQueryParams(`${base}/app/${this.config.appKey}/stream`, {
      channels: this.config.channels.join(','),
      token: token || undefined,
      clientId: !token && this.config.clientId ? this.config.clientId : undefined,
      history: this.config.history ? 'true' : undefined,
      user_data: this.config.user_data ? JSON.stringify(this.config.user_data) : undefined,
      auth: Object.keys(authMap).length > 0 ? JSON.stringify(authMap) : undefined,
    })

    this.es = new this.EventSourceCtor(streamUrl)

    this.es.addEventListener('connected', (e) => {
      const message = JSON.parse(e.data) as ConnectedMessage
      this.connectionId = message.connection_id
      this.emit('connected', message)
      this.emit('message', message)
    })

    this.es.addEventListener('event', (e) => {
      const message = JSON.parse(e.data) as EventMessage
      this.emit('event', message)
      this.emit('message', message)
    })

    this.es.addEventListener('presence', (e) => {
      const message = JSON.parse(e.data) as PresenceMessage
      this.emit('presence', message)
      this.emit('message', message)
    })

    this.es.onerror = () => {
      this.emit('error', new Error('SSE connection error'))
    }
  }

  disconnect(): void {
    if (this.es) {
      this.es.close()
      this.es = null
      this.connectionId = null
      this.emit('close')
    }
  }

  bind(
    channel: string,
    event: string,
    handler: (data: unknown, message: EventMessage) => void
  ): () => void {
    const listener = (message: EventMessage) => {
      if (message.channel === channel && message.event === event) {
        handler(message.data, message)
      }
    }
    return this.on('event', listener)
  }

  bindAll(channel: string, handler: (data: unknown, message: EventMessage) => void): () => void {
    const listener = (message: EventMessage) => {
      if (message.channel === channel) {
        handler(message.data, message)
      }
    }
    return this.on('event', listener)
  }
}
