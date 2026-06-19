import type { ApiError } from './types'

export class ArkNotifyError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSec?: number
  readonly reason?: string

  constructor(status: number, body: ApiError) {
    super(body.message)
    this.name = 'ArkNotifyError'
    this.status = status
    this.code = body.error
    this.retryAfterSec = body.retryAfterSec
    this.reason = body.reason
  }
}

export function toWebSocketUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const httpUrl = `${normalizedBase}${normalizedPath}`
  // Avoid URL.protocol — not supported in React Native and some runtimes.
  return httpUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
}

/** Append query params without URLSearchParams (unsupported in React Native). */
export function appendQueryParams(
  url: string,
  params: Record<string, string | undefined | null | false>
): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => {
      const value = entry[1]
      return value !== undefined && value !== null && value !== false && value !== ''
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

  if (!query) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${query}`
}

export function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function isPrivateChannel(channel: string): boolean {
  return channel.startsWith('private-')
}

/** Whether a server-stream subscription entry is a pattern (`business-*` or `*`). */
export function isServerStreamPattern(subscription: string): boolean {
  return subscription === '*' || subscription.endsWith('*')
}

/** Whether a server-stream subscription entry matches all channels. */
export function isAllChannelsSubscription(subscription: string): boolean {
  return subscription === '*'
}

/** Whether an event channel name matches a server-stream prefix pattern or `*`. */
export function matchesChannelPattern(channel: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (!pattern.endsWith('*')) return channel === pattern
  return channel.startsWith(pattern.slice(0, -1))
}
