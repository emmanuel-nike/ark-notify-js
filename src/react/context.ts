import { createContext, useContext } from 'react'
import type { ArkNotifyClient } from '../client'
import type { ArkNotifyConnection } from '../connection'
import type { ArkNotifySSE } from '../sse'
import type { ArkNotifyConnectionConfig, ArkNotifySSEConfig } from '../types'

export interface ArkNotifyContextValue {
  baseUrl: string
  client: ArkNotifyClient
  createConnection: (config: Omit<ArkNotifyConnectionConfig, 'baseUrl'>) => ArkNotifyConnection
  createSSE: (config: Omit<ArkNotifySSEConfig, 'baseUrl'>) => ArkNotifySSE
}

export const ArkNotifyContext = createContext<ArkNotifyContextValue | null>(null)

export function useArkNotifyContext(): ArkNotifyContextValue {
  const ctx = useContext(ArkNotifyContext)
  if (!ctx) {
    throw new Error('useArkNotify must be used within an ArkNotifyProvider')
  }
  return ctx
}
