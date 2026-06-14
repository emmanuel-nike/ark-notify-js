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
  const url = new URL(path, baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function isPrivateChannel(channel: string): boolean {
  return channel.startsWith('private-')
}
