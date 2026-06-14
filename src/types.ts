// ── Shared ──────────────────────────────────────────────────────────────────

export type UserRole = 'SYSTEM_ADMIN' | 'ACCOUNT_ADMIN' | 'ACCOUNT_USER'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  createdAt: string
}

export interface ApiError {
  error: string
  message: string
  reason?: string
  retryAfterSec?: number
}

export interface ConnectionCapabilities {
  subscribe: boolean
  publish: boolean
  presence: boolean
}

// ── Applications ────────────────────────────────────────────────────────────

export interface Application {
  id: string
  name: string
  appKey: string
  tenantId: string
  authWebhookUrl: string | null
  requireClientAuth: boolean
  serverAuthUrl: string | null
  messageHistorySize: number
  createdAt: string
  updatedAt: string
  secret?: string
}

export interface CreateApplicationInput {
  name: string
  authWebhookUrl?: string | null
  requireClientAuth?: boolean
  serverAuthUrl?: string | null
  messageHistorySize?: number
}

export interface UpdateApplicationInput {
  name?: string
  authWebhookUrl?: string | null
  requireClientAuth?: boolean
  serverAuthUrl?: string | null
  messageHistorySize?: number
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
}

// ── Data plane REST ─────────────────────────────────────────────────────────

export interface PublishEventInput {
  channel: string
  event: string
  data?: unknown
}

export interface PublishEventResponse {
  published: boolean
  channel: string
  event: string
}

export interface ChannelAuthInput {
  socket_id?: string
  connection_id?: string
  channel_name: string
  user_data?: Record<string, unknown>
}

export interface ChannelAuthResponse {
  auth: string
}

export interface ConnectionTokenInput {
  client_id?: string
  clientId?: string
  user_data?: Record<string, unknown>
  userData?: Record<string, unknown>
  serverAuthUrl?: string | null
  server_auth_url?: string | null
  ttl?: number
  capabilities?: Partial<ConnectionCapabilities>
}

export interface ConnectionTokenResponse {
  token: string
  client_id: string
  expires_at: number
  capabilities: ConnectionCapabilities
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface PresenceMember {
  connectionId: string
  clientId: string
  data: Record<string, unknown>
  updatedAt: number
}

export interface AdminConnection {
  connectionId: string
  clientId: string
  transport: 'websocket' | 'sse'
  authenticated: boolean
  connectedAt: number
}

export interface AdminChannel {
  tenantId: string
  channel: string
  applicationId: string
  applicationName: string
  appKey: string
  subscriberCount: number
  presenceMemberCount: number
  presenceMembers: PresenceMember[]
  connections: AdminConnection[]
  analytics: {
    eventsByType: Record<string, number>
    totalEvents: number
    lastEventAt: string | null
  }
}

export interface AdminChannelsResponse {
  generatedAt: string
  summary: {
    totalApplications: number
    totalChannels: number
    totalConnections: number
    totalPresenceMembers: number
    totalSubscribers: number
    totalAnalyticsEvents: number
  }
  channels: AdminChannel[]
  connections: AdminConnection[]
  analytics: {
    eventsByType: Array<{ eventType: string; eventCount: number }>
    recentEvents: unknown[]
  }
}

// ── WebSocket / SSE messages ─────────────────────────────────────────────────

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export interface ConnectedMessage {
  type: 'connected'
  connection_id: string
  client_id: string
  app_key: string
  authenticated: boolean
  channels?: string[]
}

export interface EventMessage {
  type: 'event'
  channel: string
  event: string
  data: unknown
  clientId: string | null
  timestamp: number
}

export interface PresenceMemberInfo {
  connectionId: string
  clientId: string
  data: Record<string, unknown>
  updatedAt: number
}

export type PresenceAction = 'enter' | 'leave' | 'update' | 'sync'

export interface PresenceMessage {
  type: 'presence'
  channel: string
  action: PresenceAction
  member: PresenceMemberInfo | null
  members: PresenceMemberInfo[] | null
  timestamp: number
}

export interface SubscribedMessage {
  type: 'subscribed'
  channel: string
}

export interface UnsubscribedMessage {
  type: 'unsubscribed'
  channel: string
}

export interface PublishedMessage {
  type: 'published'
  channel: string
  event: string
}

export interface PongMessage {
  type: 'pong'
  timestamp: number
}

export interface PingMessage {
  type: 'ping'
}

export interface ServerErrorMessage {
  type: 'error'
  code: string
  message: string
}

export interface PresenceUpdatedMessage {
  type: 'presence_updated'
  channel: string
  data: Record<string, unknown>
}

export interface PresenceLeftMessage {
  type: 'presence_left'
  channel: string
}

export type ServerMessage =
  | ConnectedMessage
  | EventMessage
  | PresenceMessage
  | SubscribedMessage
  | UnsubscribedMessage
  | PublishedMessage
  | PongMessage
  | PingMessage
  | ServerErrorMessage
  | PresenceUpdatedMessage
  | PresenceLeftMessage

// ── Client config ───────────────────────────────────────────────────────────

export interface ArkNotifyClientConfig {
  baseUrl?: string
  token?: string | (() => string | null | undefined)
  fetch?: typeof fetch
}

export interface AppCredentials {
  appKey: string
  secret: string
}

export type PrivateChannelAuthHandler = (
  channel: string,
  connectionId: string
) => Promise<string>

export interface ArkNotifyConnectionConfig {
  baseUrl?: string
  appKey: string
  clientId?: string
  /** Signed connection token, or a resolver. Omit to auto-fetch when `credentials` and `clientId` are set. */
  token?: string | (() => string | null | undefined)
  /** App credentials for auto-fetching a connection token (server-side only — never in browser code). */
  credentials?: AppCredentials
  /** Forwarded to the connection-token endpoint when auto-fetching a token. */
  user_data?: Record<string, unknown>
  autoReconnect?: boolean
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  onPrivateChannelAuth?: PrivateChannelAuthHandler
  fetch?: typeof fetch
  WebSocket?: typeof WebSocket
}

export interface SubscribeOptions {
  history?: boolean
  presence?: boolean
  presence_data?: Record<string, unknown>
  auth?: string
}

export interface ArkNotifySSEConfig {
  baseUrl?: string
  appKey: string
  channels: string[]
  clientId?: string
  token?: string | (() => string | null | undefined)
  auth?: Record<string, string>
  user_data?: Record<string, unknown>
  history?: boolean
  onPrivateChannelAuth?: PrivateChannelAuthHandler
  EventSource?: typeof EventSource
}

export interface ChannelEventHandler<T = unknown> {
  (data: T, message: EventMessage): void
}

export interface ChannelHandlers {
  [eventName: string]: ChannelEventHandler
}

export interface HealthResponse {
  status: string
  uptime: number
}
