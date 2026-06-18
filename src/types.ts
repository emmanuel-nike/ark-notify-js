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

/** Payload Ark Notify POSTs to your `serverAuthUrl`. */
export interface ServerAuthRequest {
  client_id: string
  user_data?: Record<string, unknown> | null
  capabilities?: Partial<ConnectionCapabilities> | null
  ttl?: number | null
}

/** Approve a connection token request (option A). */
export interface ServerAuthAllowedResponse {
  allowed: true
  client_id: string
  capabilities?: ConnectionCapabilities
  ttl?: number
}

/** Approve with a pre-signed token (option B). */
export interface ServerAuthTokenResponse {
  token: string
}

export type ServerAuthApprovedResponse = ServerAuthAllowedResponse | ServerAuthTokenResponse

export interface ServerAuthDeniedResponse {
  allowed: false
  reason?: string
}

export type ServerAuthResponse = ServerAuthApprovedResponse | ServerAuthDeniedResponse

export interface CreateAuthorizedServerAuthResponseOptions {
  clientId: string
  capabilities?: Partial<ConnectionCapabilities>
  ttl?: number
  /** When provided, returns a pre-signed token instead of `{ allowed: true }`. */
  credentials?: AppCredentials
}

export type ServerAuthDecision =
  | false
  | {
      clientId?: string
      capabilities?: Partial<ConnectionCapabilities>
      ttl?: number
    }

export interface HandleServerAuthOptions {
  request: ServerAuthRequest
  isAuthorized: (request: ServerAuthRequest) => ServerAuthDecision | Promise<ServerAuthDecision>
  credentials?: AppCredentials
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

export interface ServerStreamConnectedMessage {
  type: 'connected'
  connection_id: string
  app_key: string
  channels: string[]
  transport: 'server-stream'
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

export type PrivateChannelAuthHandler = (channel: string, connectionId: string) => Promise<string>

export interface ArkNotifyConnectionConfig {
  baseUrl?: string
  appKey: string
  clientId?: string
  /** Signed connection token, or a resolver. Omit to auto-fetch when `clientId` is set. */
  token?: string | (() => string | null | undefined)
  /** App credentials for auto-fetching a connection token (backend-only when no serverAuthUrl). */
  credentials?: AppCredentials
  /** Override server auth URL when auto-fetching a token; uses the application default when omitted. */
  serverAuthUrl?: string | null
  /** Forwarded to the connection-token endpoint when auto-fetching a token. */
  userData?: Record<string, unknown>
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

export interface ArkNotifyServerStreamConfig {
  baseUrl?: string
  appKey: string
  credentials: AppCredentials
  channels: string[]
  history?: boolean
  fetch?: typeof fetch
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
