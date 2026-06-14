import { resolveBaseUrl } from './config'
import { ArkNotifyError } from './utils'
import type {
  AdminChannelsResponse,
  Application,
  ArkNotifyClientConfig,
  AppCredentials,
  AuthResponse,
  ChannelAuthInput,
  ChannelAuthResponse,
  ConnectionTokenInput,
  ConnectionTokenResponse,
  CreateApplicationInput,
  HealthResponse,
  LoginInput,
  PublishEventInput,
  PublishEventResponse,
  RegisterInput,
  UpdateApplicationInput,
  User,
} from './types'
import { resolveValue } from './utils'

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  credentials?: AppCredentials
}

export class ArkNotifyClient {
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  private token?: string | (() => string | null | undefined)

  constructor(config: ArkNotifyClientConfig) {
    this.baseUrl = resolveBaseUrl(config.baseUrl)
    this.token = config.token
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  setToken(token: string | null): void {
    this.token = token ?? undefined
  }

  private getAuthHeader(): string | undefined {
    const token = resolveValue(this.token)
    return token ? `Bearer ${token}` : undefined
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    const auth = this.getAuthHeader()
    if (auth) {
      headers.Authorization = auth
    }

    if (options.credentials) {
      headers['X-App-Key'] = options.credentials.appKey
      headers['X-App-Secret'] = options.credentials.secret
    }

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  // ── Health ──────────────────────────────────────────────────────────────

  health(): Promise<HealthResponse> {
    return this.request('/health')
  }

  // ── Platform auth ───────────────────────────────────────────────────────

  register(input: RegisterInput): Promise<AuthResponse> {
    return this.request('/api/v1/auth/register', { method: 'POST', body: input })
  }

  login(input: LoginInput): Promise<AuthResponse> {
    return this.request('/api/v1/auth/login', { method: 'POST', body: input })
  }

  me(): Promise<{ user: User }> {
    return this.request('/api/v1/auth/me')
  }

  // ── Applications ────────────────────────────────────────────────────────

  listApplications(): Promise<{ apps: Application[] }> {
    return this.request('/api/v1/applications')
  }

  createApplication(input: CreateApplicationInput): Promise<{ app: Application }> {
    return this.request('/api/v1/applications', { method: 'POST', body: input })
  }

  getApplication(id: string): Promise<{ app: Application }> {
    return this.request(`/api/v1/applications/${id}`)
  }

  updateApplication(
    id: string,
    input: UpdateApplicationInput
  ): Promise<{ app: Application }> {
    return this.request(`/api/v1/applications/${id}`, { method: 'PUT', body: input })
  }

  deleteApplication(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request(`/api/v1/applications/${id}`, { method: 'DELETE' })
  }

  regenerateSecret(id: string): Promise<{ app: Application }> {
    return this.request(`/api/v1/applications/${id}/regenerate-secret`, {
      method: 'POST',
    })
  }

  // ── System admin ────────────────────────────────────────────────────────

  adminChannels(): Promise<AdminChannelsResponse> {
    return this.request('/api/v1/admin/channels')
  }

  // ── Data plane ──────────────────────────────────────────────────────────

  publishEvent(
    appKey: string,
    credentials: AppCredentials,
    input: PublishEventInput
  ): Promise<PublishEventResponse> {
    return this.request(`/api/v1/apps/${appKey}/events`, {
      method: 'POST',
      body: input,
      credentials,
    })
  }

  authorizeChannel(
    appKey: string,
    credentials: AppCredentials,
    input: ChannelAuthInput
  ): Promise<ChannelAuthResponse> {
    return this.request(`/api/v1/apps/${appKey}/auth`, {
      method: 'POST',
      body: input,
      credentials,
    })
  }

  issueConnectionToken(
    appKey: string,
    credentials: AppCredentials,
    input: ConnectionTokenInput
  ): Promise<ConnectionTokenResponse> {
    return this.request(`/api/v1/apps/${appKey}/connection-token`, {
      method: 'POST',
      body: input,
      credentials,
    })
  }
}
