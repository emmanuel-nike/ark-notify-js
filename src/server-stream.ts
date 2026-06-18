import { resolveBaseUrl } from './config'
import type {
  AppCredentials,
  ArkNotifyServerStreamConfig,
  EventMessage,
  PresenceMessage,
  ServerErrorMessage,
  ServerStreamConnectedMessage,
} from './types'
import { appendQueryParams, ArkNotifyError } from './utils'

type ServerStreamEventMap = {
  connected: (message: ServerStreamConnectedMessage) => void
  event: (message: EventMessage) => void
  presence: (message: PresenceMessage) => void
  message: (message: ServerStreamMessage) => void
  error: (error: Error) => void
  close: () => void
}

type ServerStreamEventName = keyof ServerStreamEventMap

function buildAppCredentialsHeaders(credentials: AppCredentials): Record<string, string> {
  return {
    'X-App-Key': credentials.appKey,
    'X-App-Secret': credentials.secret,
  }
}

type ServerStreamMessage = ServerStreamConnectedMessage | EventMessage | PresenceMessage | ServerErrorMessage

function dispatchSseEvent(
  data: string,
  handlers: {
    onConnected: (message: ServerStreamConnectedMessage) => void
    onEvent: (message: EventMessage) => void
    onPresence: (message: PresenceMessage) => void
    onMessage: (message: ServerStreamMessage) => void
  }
): void {
  if (!data) return

  let parsed: ServerStreamMessage
  try {
    parsed = JSON.parse(data) as ServerStreamMessage
  } catch {
    return
  }

  if (parsed.type === 'connected') {
    handlers.onConnected(parsed)
    handlers.onMessage(parsed)
    return
  }

  if (parsed.type === 'event') {
    handlers.onEvent(parsed)
    handlers.onMessage(parsed)
    return
  }

  if (parsed.type === 'presence') {
    handlers.onPresence(parsed)
    handlers.onMessage(parsed)
    return
  }

  handlers.onMessage(parsed)
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onSseData: (data: string) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: string | null = null
  let dataLines: string[] = []

  const flushEvent = () => {
    if (dataLines.length === 0 && currentEvent === null) return
    onSseData(dataLines.join('\n'))
    currentEvent = null
    dataLines = []
  }

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

        if (line === '') {
          flushEvent()
          continue
        }

        if (line.startsWith(':')) continue

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trimStart()
          continue
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }
    }

    if (buffer.length > 0) {
      const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    flushEvent()
  } finally {
    reader.releaseLock()
  }
}

export class ArkNotifyServerStream {
  private readonly config: ArkNotifyServerStreamConfig & { baseUrl: string }
  private readonly fetchFn: typeof fetch
  private readonly listeners = new Map<
    ServerStreamEventName,
    Set<ServerStreamEventMap[ServerStreamEventName]>
  >()
  private abortController: AbortController | null = null
  private connectionId: string | null = null
  private connecting = false

  constructor(config: ArkNotifyServerStreamConfig) {
    this.config = { ...config, baseUrl: resolveBaseUrl(config.baseUrl) }
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  getConnectionId(): string | null {
    return this.connectionId
  }

  on<E extends ServerStreamEventName>(event: E, handler: ServerStreamEventMap[E]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off<E extends ServerStreamEventName>(event: E, handler: ServerStreamEventMap[E]): void {
    this.listeners.get(event)?.delete(handler)
  }

  private emit<E extends ServerStreamEventName>(
    event: E,
    ...args: Parameters<ServerStreamEventMap[E]>
  ): void {
    for (const handler of this.listeners.get(event) ?? []) {
      ;(handler as (...a: Parameters<ServerStreamEventMap[E]>) => void)(...args)
    }
  }

  async connect(): Promise<void> {
    if (this.abortController || this.connecting) return

    this.connecting = true
    const abortController = new AbortController()
    this.abortController = abortController

    const base = this.config.baseUrl.replace(/\/$/, '')
    const streamUrl = appendQueryParams(
      `${base}/api/v1/apps/${this.config.appKey}/server-stream`,
      {
        channels: this.config.channels.join(','),
        history: this.config.history ? 'true' : undefined,
      }
    )

    try {
      const response = await this.fetchFn(streamUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...buildAppCredentialsHeaders(this.config.credentials),
        },
        signal: abortController.signal,
      })

      if (!response.ok) {
        let body: { error: string; message: string; reason?: string; retryAfterSec?: number }
        try {
          body = await response.json()
        } catch {
          body = { error: 'request_failed', message: response.statusText }
        }
        throw new ArkNotifyError(response.status, body)
      }

      if (!response.body) {
        throw new Error('Server stream response has no body')
      }

      void this.consumeStream(response.body, abortController)
    } catch (err) {
      if (abortController.signal.aborted) return
      this.abortController = null
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      this.emit('close')
    } finally {
      this.connecting = false
    }
  }

  private async consumeStream(body: ReadableStream<Uint8Array>, abortController: AbortController): Promise<void> {
    try {
      await readSseStream(
        body,
        (data) => {
          dispatchSseEvent(data, {
            onConnected: (message) => {
              this.connectionId = message.connection_id
              this.emit('connected', message)
            },
            onEvent: (message) => this.emit('event', message),
            onPresence: (message) => this.emit('presence', message),
            onMessage: (message) => this.emit('message', message),
          })
        },
        abortController.signal
      )
    } catch (err) {
      if (abortController.signal.aborted) return
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null
        this.connectionId = null
        this.emit('close')
      }
    }
  }

  disconnect(): void {
    if (!this.abortController) return
    this.abortController.abort()
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
