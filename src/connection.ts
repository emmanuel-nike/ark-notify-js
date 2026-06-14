import { resolveBaseUrl } from './config'
import { fetchConnectionToken } from './connection-token'
import type {
  ArkNotifyConnectionConfig,
  ChannelEventHandler,
  ConnectedMessage,
  ConnectionState,
  EventMessage,
  PresenceMessage,
  ServerMessage,
  SubscribeOptions,
} from './types'
import { isPrivateChannel, resolveValue, toWebSocketUrl } from './utils'

type EventMap = {
  state: (state: ConnectionState) => void
  connected: (message: ConnectedMessage) => void
  event: (message: EventMessage) => void
  presence: (message: PresenceMessage) => void
  message: (message: ServerMessage) => void
  error: (error: { code: string; message: string }) => void
  close: (event: { code: number; reason: string }) => void
}

type EventName = keyof EventMap

export class ArkNotifyConnection {
  private readonly config: Required<
    Pick<
      ArkNotifyConnectionConfig,
      'baseUrl' | 'appKey' | 'autoReconnect' | 'reconnectDelayMs' | 'maxReconnectDelayMs'
    >
  > &
    ArkNotifyConnectionConfig

  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private connectionId: string | null = null
  private clientId: string | null = null
  private authenticated = false
  private subscribedChannels = new Set<string>()
  private pendingSubscriptions = new Map<string, SubscribeOptions>()
  private listeners = new Map<EventName, Set<EventMap[EventName]>>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private connectPromise: Promise<void> | null = null
  private readonly WebSocketCtor: typeof WebSocket

  constructor(config: ArkNotifyConnectionConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      ...config,
      baseUrl: resolveBaseUrl(config.baseUrl),
    }
    this.WebSocketCtor = config.WebSocket ?? globalThis.WebSocket
  }

  getConnectionState(): ConnectionState {
    return this.state
  }

  getConnectionId(): string | null {
    return this.connectionId
  }

  getClientId(): string | null {
    return this.clientId
  }

  isAuthenticated(): boolean {
    return this.authenticated
  }

  getSubscribedChannels(): string[] {
    return [...this.subscribedChannels]
  }

  on<E extends EventName>(event: E, handler: EventMap[E]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventMap[EventName])
    return () => this.off(event, handler)
  }

  off<E extends EventName>(event: E, handler: EventMap[E]): void {
    this.listeners.get(event)?.delete(handler as EventMap[EventName])
  }

  private emit<E extends EventName>(event: E, ...args: Parameters<EventMap[E]>): void {
    for (const handler of this.listeners.get(event) ?? []) {
      ;(handler as (...a: Parameters<EventMap[E]>) => void)(...args)
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.emit('state', state)
    }
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return Promise.resolve()
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  private async doConnect(): Promise<void> {
    this.intentionalClose = false
    this.clearReconnectTimer()
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const url = new URL(
      toWebSocketUrl(this.config.baseUrl, `/app/${this.config.appKey}`)
    )

    let token = resolveValue(this.config.token)
    if (!token && this.config.clientId && this.config.credentials) {
      const result = await fetchConnectionToken({
        baseUrl: this.config.baseUrl,
        appKey: this.config.appKey,
        credentials: this.config.credentials,
        client_id: this.config.clientId,
        user_data: this.config.user_data,
        fetch: this.config.fetch,
      })
      token = result.token
    }

    if (token) {
      url.searchParams.set('token', token)
    } else if (this.config.clientId) {
      url.searchParams.set('clientId', this.config.clientId)
    }

    this.ws = new this.WebSocketCtor(url.toString())

    this.ws.onopen = () => {
      this.reconnectAttempt = 0
    }

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data as string)
    }

    this.ws.onerror = () => {
      this.emit('error', { code: 'websocket_error', message: 'WebSocket error' })
    }

    this.ws.onclose = (event) => {
      this.ws = null
      this.connectionId = null
      this.emit('close', { code: event.code, reason: event.reason })

      if (!this.intentionalClose && this.config.autoReconnect) {
        this.scheduleReconnect()
      } else {
        this.setState('failed')
      }
    }
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.subscribedChannels.clear()
    this.pendingSubscriptions.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('disconnected')
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting')
    const delay = Math.min(
      this.config.reconnectDelayMs * 2 ** this.reconnectAttempt,
      this.config.maxReconnectDelayMs
    )
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => void this.connect(), delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }
    this.ws.send(JSON.stringify(payload))
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage
    try {
      message = JSON.parse(raw) as ServerMessage
    } catch {
      this.emit('error', { code: 'invalid_json', message: 'Invalid JSON from server' })
      return
    }

    this.emit('message', message)

    switch (message.type) {
      case 'connected': {
        this.connectionId = message.connection_id
        this.clientId = message.client_id
        this.authenticated = message.authenticated
        this.setState('connected')
        this.emit('connected', message)
        this.resubscribeAll()
        break
      }
      case 'event':
        this.emit('event', message)
        break
      case 'presence':
        this.emit('presence', message)
        break
      case 'subscribed':
        this.subscribedChannels.add(message.channel)
        break
      case 'unsubscribed':
        this.subscribedChannels.delete(message.channel)
        break
      case 'error':
        this.emit('error', { code: message.code, message: message.message })
        break
      case 'ping':
        this.send({ action: 'ping' })
        break
      default:
        break
    }
  }

  private resubscribeAll(): void {
    for (const [channel, options] of this.pendingSubscriptions) {
      void this.subscribe(channel, options)
    }
  }

  async subscribe(channel: string, options: SubscribeOptions = {}): Promise<void> {
    this.pendingSubscriptions.set(channel, options)

    if (this.state !== 'connected' || !this.connectionId) {
      return
    }

    const payload: Record<string, unknown> = {
      action: 'subscribe',
      channel,
    }

    if (options.history) payload.history = true
    if (options.presence) {
      payload.presence = true
      if (options.presence_data) payload.presence_data = options.presence_data
    }

    if (isPrivateChannel(channel)) {
      if (options.auth) {
        payload.auth = options.auth
      } else if (this.config.onPrivateChannelAuth) {
        payload.auth = await this.config.onPrivateChannelAuth(channel, this.connectionId)
      } else {
        throw new Error(
          `Private channel "${channel}" requires auth. Provide options.auth or onPrivateChannelAuth.`
        )
      }
    }

    this.send(payload)
  }

  unsubscribe(channel: string): void {
    this.pendingSubscriptions.delete(channel)
    this.subscribedChannels.delete(channel)
    if (this.state === 'connected') {
      this.send({ action: 'unsubscribe', channel })
    }
  }

  publish(channel: string, event: string, data?: unknown): void {
    this.send({ action: 'publish', channel, event, data })
  }

  presenceEnter(channel: string, data: Record<string, unknown>): void {
    this.send({ action: 'presence_enter', channel, data })
  }

  presenceUpdate(channel: string, data: Record<string, unknown>): void {
    this.send({ action: 'presence_update', channel, data })
  }

  presenceLeave(channel: string): void {
    this.send({ action: 'presence_leave', channel })
  }

  presenceSync(channel: string): void {
    this.send({ action: 'presence_sync', channel })
  }

  ping(): void {
    this.send({ action: 'ping' })
  }

  bind(channel: string, event: string, handler: ChannelEventHandler): () => void {
    const listener = (message: EventMessage) => {
      if (message.channel === channel && message.event === event) {
        handler(message.data, message)
      }
    }
    return this.on('event', listener)
  }

  bindAll(channel: string, handler: ChannelEventHandler): () => void {
    const listener = (message: EventMessage) => {
      if (message.channel === channel) {
        handler(message.data, message)
      }
    }
    return this.on('event', listener)
  }
}
