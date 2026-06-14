import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ArkNotifyClient } from '../client'
import { resolveBaseUrl } from '../config'
import { ArkNotifyConnection } from '../connection'
import { ArkNotifySSE } from '../sse'
import type { ArkNotifyClientConfig, ArkNotifyConnectionConfig, ArkNotifySSEConfig } from '../types'
import { ArkNotifyContext } from './context'

export interface ArkNotifyProviderProps {
  children: ReactNode
  baseUrl?: string
  token?: ArkNotifyClientConfig['token']
  fetch?: ArkNotifyClientConfig['fetch']
}

export function ArkNotifyProvider({
  children,
  baseUrl,
  token,
  fetch: fetchFn,
}: Readonly<ArkNotifyProviderProps>) {
  const resolvedBaseUrl = useMemo(() => resolveBaseUrl(baseUrl), [baseUrl])
  const clientRef = useRef<ArkNotifyClient | null>(null)

  clientRef.current ??= new ArkNotifyClient({ baseUrl, token, fetch: fetchFn })

  const client = clientRef.current

  useEffect(() => {
    if (token === undefined) return
    const resolved = typeof token === 'function' ? (token() ?? null) : (token ?? null)
    client.setToken(resolved)
  }, [client, token])

  const createConnection = useCallback(
    (config: Omit<ArkNotifyConnectionConfig, 'baseUrl'>) =>
      new ArkNotifyConnection({ baseUrl: resolvedBaseUrl, ...config }),
    [resolvedBaseUrl]
  )

  const createSSE = useCallback(
    (config: Omit<ArkNotifySSEConfig, 'baseUrl'>) =>
      new ArkNotifySSE({ baseUrl: resolvedBaseUrl, ...config }),
    [resolvedBaseUrl]
  )

  const value = useMemo(
    () => ({ baseUrl: resolvedBaseUrl, client, createConnection, createSSE }),
    [resolvedBaseUrl, client, createConnection, createSSE]
  )

  return <ArkNotifyContext.Provider value={value}>{children}</ArkNotifyContext.Provider>
}
