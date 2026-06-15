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
  const httpUrl = new URL(path, baseUrl).href
  // Avoid assigning to url.protocol — not supported in React Native and some runtimes.
  return httpUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
}

export function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function isPrivateChannel(channel: string): boolean {
  return channel.startsWith('private-')
}
