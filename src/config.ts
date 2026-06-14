export const DEFAULT_BASE_URL = 'https://ark-notify-933303906015.europe-north1.run.app'

let configuredBaseUrl: string | undefined

export interface ArkNotifyGlobalConfig {
  baseUrl?: string
}

/** Set the default base URL once at application startup. */
export function configureArkNotify(config: ArkNotifyGlobalConfig): void {
  if (config.baseUrl !== undefined) {
    configuredBaseUrl = config.baseUrl
  }
}

export function resolveBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? configuredBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
}
