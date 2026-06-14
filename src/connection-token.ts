import { resolveBaseUrl } from './config'
import type { AppCredentials, ConnectionTokenInput, ConnectionTokenResponse } from './types'
import { ArkNotifyError } from './utils'

export interface FetchConnectionTokenOptions extends ConnectionTokenInput {
  baseUrl?: string
  appKey: string
  /** Required unless the application has a serverAuthUrl (or one is passed in the request). */
  credentials?: AppCredentials
  fetch?: typeof fetch
}

function requiresAppSecret(options: FetchConnectionTokenOptions): boolean {
  if ('serverAuthUrl' in options) {
    const value = options.serverAuthUrl
    return value === null || value === ''
  }
  if ('server_auth_url' in options) {
    const value = options.server_auth_url
    return value === null || value === ''
  }
  return false
}

function buildConnectionTokenRequest(options: FetchConnectionTokenOptions): {
  url: string
  headers: Record<string, string>
  body: ConnectionTokenInput
} {
  const {
    baseUrl,
    appKey,
    credentials,
    client_id,
    clientId,
    user_data,
    userData,
    ttl,
    capabilities,
    serverAuthUrl,
    server_auth_url,
  } = options

  const resolvedClientId = client_id ?? clientId
  if (!resolvedClientId) {
    throw new Error('client_id is required to fetch a connection token')
  }

  if (requiresAppSecret(options) && !credentials) {
    throw new Error(
      'credentials are required when serverAuthUrl is explicitly set to null'
    )
  }

  const body: ConnectionTokenInput = {
    client_id: resolvedClientId,
    user_data: user_data ?? userData,
    ttl,
    capabilities,
  }

  if ('serverAuthUrl' in options) {
    body.serverAuthUrl = serverAuthUrl
  } else if ('server_auth_url' in options) {
    body.server_auth_url = server_auth_url
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (credentials) {
    headers['X-App-Key'] = credentials.appKey
    headers['X-App-Secret'] = credentials.secret
  }

  return {
    url: `${resolveBaseUrl(baseUrl)}/api/v1/apps/${appKey}/connection-token`,
    headers,
    body,
  }
}

/**
 * Request a signed connection token from the Ark Notify API.
 *
 * Authentication depends on server auth configuration:
 * - Application or request has a `serverAuthUrl`: public `appKey` only (frontend-safe).
 * - No `serverAuthUrl`: `credentials` with app key + secret (backend-only).
 */
export async function fetchConnectionToken(
  options: FetchConnectionTokenOptions
): Promise<ConnectionTokenResponse> {
  const { fetch: fetchFn = globalThis.fetch.bind(globalThis) } = options
  const { url, headers, body } = buildConnectionTokenRequest(options)

  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let errorBody: { error: string; message: string; reason?: string; retryAfterSec?: number }
    try {
      errorBody = await response.json()
    } catch {
      errorBody = { error: 'request_failed', message: response.statusText }
    }
    throw new ArkNotifyError(response.status, errorBody)
  }

  return response.json() as Promise<ConnectionTokenResponse>
}
