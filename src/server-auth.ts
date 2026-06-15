import { createHmac } from 'node:crypto'
import type {
  ConnectionCapabilities,
  CreateAuthorizedServerAuthResponseOptions,
  HandleServerAuthOptions,
  ServerAuthApprovedResponse,
  ServerAuthDeniedResponse,
  ServerAuthRequest,
  ServerAuthResponse,
  ServerAuthDecision,
} from './types'

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_\-.@]{1,128}$/
const DEFAULT_TTL_SECONDS = 3600
const MAX_TTL_SECONDS = 86400

const DEFAULT_CAPABILITIES: ConnectionCapabilities = {
  subscribe: true,
  publish: true,
  presence: true,
}

export function isValidClientId(clientId: unknown): clientId is string {
  return typeof clientId === 'string' && CLIENT_ID_PATTERN.test(clientId)
}

function normalizeCapabilities(
  capabilities?: Partial<ConnectionCapabilities> | null
): ConnectionCapabilities {
  if (!capabilities || typeof capabilities !== 'object') {
    return { ...DEFAULT_CAPABILITIES }
  }

  return {
    subscribe: capabilities.subscribe !== false,
    publish: capabilities.publish !== false,
    presence: capabilities.presence !== false,
  }
}

function resolveTokenTtl(ttl?: number | null): number {
  if (ttl === undefined || ttl === null) {
    return DEFAULT_TTL_SECONDS
  }

  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error('ttl must be a positive integer (seconds)')
  }

  return Math.min(ttl, MAX_TTL_SECONDS)
}

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function computeConnectionTokenSignature(
  secret: string,
  appKey: string,
  payloadEncoded: string
): string {
  return createHmac('sha256', secret).update(`${appKey}.${payloadEncoded}`).digest('hex')
}

/** Build a signed connection token in Ark Notify format. */
export function buildConnectionToken(
  appKey: string,
  secret: string,
  options: {
    clientId: string
    exp: number
    capabilities?: Partial<ConnectionCapabilities>
  }
): string {
  if (!isValidClientId(options.clientId)) {
    throw new Error('clientId must be 1-128 alphanumeric characters')
  }

  const payloadEncoded = encodePayload({
    client_id: options.clientId,
    exp: options.exp,
    capabilities: normalizeCapabilities(options.capabilities),
  })

  const signature = computeConnectionTokenSignature(secret, appKey, payloadEncoded)
  return `${appKey}.${payloadEncoded}.${signature}`
}

/**
 * Parse the JSON body Ark Notify sends to your `serverAuthUrl`.
 * Returns null when the payload is invalid.
 */
export function parseServerAuthRequest(body: unknown): ServerAuthRequest | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const record = body as Record<string, unknown>
  const client_id = record.client_id ?? record.clientId

  if (!isValidClientId(client_id)) {
    return null
  }

  const user_data = record.user_data ?? record.userData
  const capabilities = record.capabilities
  const ttl = record.ttl

  return {
    client_id,
    user_data:
      user_data === undefined
        ? null
        : user_data && typeof user_data === 'object'
        ? (user_data as Record<string, unknown>)
        : null,
    capabilities:
      capabilities && typeof capabilities === 'object'
        ? (capabilities as Partial<ConnectionCapabilities>)
        : null,
    ttl: typeof ttl === 'number' ? ttl : null,
  }
}

/**
 * Build an approved response for your `serverAuthUrl` webhook.
 *
 * - Without `credentials`: returns `{ allowed: true, client_id, ... }` (option A).
 * - With `credentials`: returns `{ token }` with a pre-signed token (option B).
 */
export function createAuthorizedServerAuthResponse(
  options: CreateAuthorizedServerAuthResponseOptions
): ServerAuthApprovedResponse {
  if (!isValidClientId(options.clientId)) {
    throw new Error('clientId must be 1-128 alphanumeric characters')
  }

  const capabilities = normalizeCapabilities(options.capabilities)
  const ttl = resolveTokenTtl(options.ttl)

  if (options.credentials) {
    const exp = Math.floor(Date.now() / 1000) + ttl
    return {
      token: buildConnectionToken(options.credentials.appKey, options.credentials.secret, {
        clientId: options.clientId,
        exp,
        capabilities,
      }),
    }
  }

  return {
    allowed: true,
    client_id: options.clientId,
    capabilities,
    ttl,
  }
}

/** Build a denied response for your `serverAuthUrl` webhook. */
export function createDeniedServerAuthResponse(reason?: string): ServerAuthDeniedResponse {
  return reason ? { allowed: false, reason } : { allowed: false }
}

/**
 * Authenticate an incoming `serverAuthUrl` request and return the webhook response
 * body Ark Notify expects.
 */
export async function handleServerAuth(
  options: HandleServerAuthOptions
): Promise<ServerAuthResponse> {
  const decision: ServerAuthDecision = await options.isAuthorized(options.request)

  if (decision === false) {
    return createDeniedServerAuthResponse()
  }

  const clientId = decision.clientId ?? options.request.client_id
  if (!isValidClientId(clientId)) {
    return createDeniedServerAuthResponse('invalid_client_id')
  }

  try {
    return createAuthorizedServerAuthResponse({
      clientId,
      capabilities: decision.capabilities ?? options.request.capabilities ?? undefined,
      ttl: decision.ttl ?? options.request.ttl ?? undefined,
      credentials: options.credentials,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_request'
    return createDeniedServerAuthResponse(message)
  }
}
