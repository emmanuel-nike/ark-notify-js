import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArkNotifySSE } from '../sse'
import type { ArkNotifySSEConfig, ConnectedMessage, EventMessage } from '../types'
import { useArkNotify } from './useArkNotify'

export interface UseSSEOptions extends Omit<ArkNotifySSEConfig, 'baseUrl'> {
  enabled?: boolean
  onEvent?: (event: string, data: unknown, message: EventMessage) => void
}

export interface UseSSEResult {
  sse: ArkNotifySSE | null
  connected: boolean
  connectionId: string | null
  connectedMessage: ConnectedMessage | null
  connect: () => void
  disconnect: () => void
  bind: (channel: string, event: string, handler: (data: unknown) => void) => () => void
}

export function useSSE(options: UseSSEOptions): UseSSEResult {
  const { createSSE } = useArkNotify()
  const { enabled = true, onEvent, ...sseConfig } = options

  const sseRef = useRef<ArkNotifySSE | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectedMessage, setConnectedMessage] = useState<ConnectedMessage | null>(null)

  if (!sseRef.current) {
    sseRef.current = createSSE(sseConfig)
  }

  const sse = sseRef.current!

  useEffect(() => {
    if (!enabled) return

    const unsubs = [
      sse.on('connected', (msg) => {
        setConnected(true)
        setConnectedMessage(msg)
      }),
      sse.on('close', () => {
        setConnected(false)
        setConnectedMessage(null)
      }),
      onEvent
        ? sse.on('event', (msg) => onEvent(msg.event, msg.data, msg))
        : () => {},
    ]

    void sse.connect()

    return () => {
      unsubs.forEach((u) => u())
      sse.disconnect()
      setConnected(false)
    }
  }, [sse, enabled, onEvent])

  const connect = useCallback(() => void sse.connect(), [sse])
  const disconnect = useCallback(() => sse.disconnect(), [sse])

  const bind = useCallback(
    (channel: string, event: string, handler: (data: unknown) => void) =>
      sse.bind(channel, event, (data) => handler(data)),
    [sse]
  )

  return {
    sse,
    connected,
    connectionId: sse.getConnectionId(),
    connectedMessage,
    connect,
    disconnect,
    bind,
  }
}
