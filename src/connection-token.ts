import { resolveBaseUrl } from './config'
import type { AppCredentials, ConnectionTokenInput, ConnectionTokenResponse } from './types'
import { ArkNotifyError } from './utils'

export interface FetchConnectionTokenOptions extends ConnectionTokenInput {
  baseUrl?: string
  appKey: string
  credentials: AppCredentials
  fetch?: typeof fetch
}

/**
 * Request a signed connection token from the Ark Notify API.
 * Requires app credentials — use from your backend, not in browser code.
 */
export async function fetchConnectionToken(
  options: FetchConnectionTokenOptions
): Promise<ConnectionTokenResponse> {
  const {
    baseUrl,
    appKey,
    credentials,
    fetch: fetchFn = globalThis.fetch.bind(globalThis),
    client_id,
    clientId,
    user_data,
    userData,
    ttl,
    capabilities,
    serverAuthUrl,
  } = options

  const resolvedClientId = client_id ?? clientId
  if (!resolvedClientId) {
    throw new Error('client_id is required to fetch a connection token')
  }

  const body: ConnectionTokenInput = {
    client_id: resolvedClientId,
    user_data: user_data ?? userData,
    ttl,
    capabilities,
    serverAuthUrl,
  }

  const url = `${resolveBaseUrl(baseUrl)}/api/v1/apps/${appKey}/connection-token`
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Key': credentials.appKey,
      'X-App-Secret': credentials.secret,
    },
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
