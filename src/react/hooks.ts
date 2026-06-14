import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ArkNotifyConnection } from '../connection'
import type {
  ArkNotifyConnectionConfig,
  ChannelEventHandler,
  ConnectedMessage,
  ConnectionState,
  EventMessage,
  PresenceMemberInfo,
  PresenceMessage,
  SubscribeOptions,
} from '../types'
import { useArkNotify } from './useArkNotify'

export interface UseConnectionOptions
  extends Omit<ArkNotifyConnectionConfig, 'baseUrl'> {
  enabled?: boolean
}

export interface UseConnectionResult {
  connection: ArkNotifyConnection | null
  state: ConnectionState
  connectionId: string | null
  clientId: string | null
  authenticated: boolean
  connectedMessage: ConnectedMessage | null
  connect: () => Promise<void>
  disconnect: () => void
}

export function useConnection(options: UseConnectionOptions): UseConnectionResult {
  const { createConnection } = useArkNotify()
  const { enabled = true, ...connectionConfig } = options

  const connectionRef = useRef<ArkNotifyConnection | null>(null)
  const [connectedMessage, setConnectedMessage] = useState<ConnectedMessage | null>(null)

  if (!connectionRef.current) {
    connectionRef.current = createConnection(connectionConfig)
  }

  const connection = connectionRef.current!

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribers = [
        connection.on('state', onStoreChange),
        connection.on('connected', (msg) => {
          setConnectedMessage(msg)
          onStoreChange()
        }),
      ]
      return () => unsubscribers.forEach((u) => u())
    },
    [connection]
  )

  const getSnapshot = useCallback(() => connection.getConnectionState(), [connection])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (enabled) {
      connection.connect()
    }
    return () => connection.disconnect()
  }, [connection, enabled])

  const connect = useCallback(() => connection.connect(), [connection])
  const disconnect = useCallback(() => connection.disconnect(), [connection])

  return {
    connection,
    state,
    connectionId: connection.getConnectionId(),
    clientId: connection.getClientId(),
    authenticated: connection.isAuthenticated(),
    connectedMessage,
    connect,
    disconnect,
  }
}

export interface UseChannelOptions extends SubscribeOptions {
  enabled?: boolean
  onEvent?: (event: string, data: unknown, message: EventMessage) => void
}

export interface UseChannelResult {
  subscribed: boolean
  subscribe: (opts?: SubscribeOptions) => Promise<void>
  unsubscribe: () => void
  publish: (event: string, data?: unknown) => void
  bind: (event: string, handler: ChannelEventHandler) => () => void
}

export function useChannel(
  connection: ArkNotifyConnection | null,
  channel: string,
  options: UseChannelOptions = {}
): UseChannelResult {
  const { enabled = true, onEvent, ...subscribeOptions } = options
  const [subscribed, setSubscribed] = useState(false)
  const subscribeOptionsRef = useRef(subscribeOptions)
  subscribeOptionsRef.current = subscribeOptions

  const subscribe = useCallback(
    async (opts?: SubscribeOptions) => {
      if (!connection) return
      await connection.subscribe(channel, { ...subscribeOptionsRef.current, ...opts })
      setSubscribed(true)
    },
    [connection, channel]
  )

  const unsubscribe = useCallback(() => {
    connection?.unsubscribe(channel)
    setSubscribed(false)
  }, [connection, channel])

  const publish = useCallback(
    (event: string, data?: unknown) => {
      connection?.publish(channel, event, data)
    },
    [connection, channel]
  )

  const bind = useCallback(
    (event: string, handler: ChannelEventHandler) => {
      if (!connection) return () => {}
      return connection.bind(channel, event, handler)
    },
    [connection, channel]
  )

  useEffect(() => {
    if (!connection || !enabled || !channel) return

    const unsubSubscribed = connection.on('message', (msg) => {
      if (msg.type === 'subscribed' && msg.channel === channel) {
        setSubscribed(true)
      }
      if (msg.type === 'unsubscribed' && msg.channel === channel) {
        setSubscribed(false)
      }
    })

    const unsubEvent = onEvent
      ? connection.on('event', (msg) => {
          if (msg.channel === channel) {
            onEvent(msg.event, msg.data, msg)
          }
        })
      : () => {}

    void subscribe()

    return () => {
      unsubSubscribed()
      unsubEvent()
      connection.unsubscribe(channel)
      setSubscribed(false)
    }
  }, [connection, channel, enabled, subscribe, onEvent])

  return { subscribed, subscribe, unsubscribe, publish, bind }
}

export interface UsePresenceResult {
  members: PresenceMemberInfo[]
  enter: (data: Record<string, unknown>) => void
  update: (data: Record<string, unknown>) => void
  leave: () => void
  sync: () => void
}

export function usePresence(
  connection: ArkNotifyConnection | null,
  channel: string,
  options: { enabled?: boolean; initialData?: Record<string, unknown> } = {}
): UsePresenceResult {
  const { enabled = true, initialData } = options
  const [members, setMembers] = useState<PresenceMemberInfo[]>([])

  useEffect(() => {
    if (!connection || !enabled || !channel) return

    const unsubscribe = connection.on('presence', (msg: PresenceMessage) => {
      if (msg.channel !== channel) return

      if (msg.action === 'sync' && msg.members) {
        setMembers(msg.members)
      } else if (msg.action === 'enter' && msg.member) {
        setMembers((prev) => {
          const filtered = prev.filter((m) => m.clientId !== msg.member!.clientId)
          return [...filtered, msg.member!]
        })
      } else if (msg.action === 'leave' && msg.member) {
        setMembers((prev) => prev.filter((m) => m.clientId !== msg.member!.clientId))
      } else if (msg.action === 'update' && msg.member) {
        setMembers((prev) =>
          prev.map((m) => (m.clientId === msg.member!.clientId ? msg.member! : m))
        )
      }
    })

    if (initialData) {
      connection.presenceEnter(channel, initialData)
    }

    return unsubscribe
  }, [connection, channel, enabled, initialData])

  const enter = useCallback(
    (data: Record<string, unknown>) => connection?.presenceEnter(channel, data),
    [connection, channel]
  )
  const update = useCallback(
    (data: Record<string, unknown>) => connection?.presenceUpdate(channel, data),
    [connection, channel]
  )
  const leave = useCallback(() => connection?.presenceLeave(channel), [connection, channel])
  const sync = useCallback(() => connection?.presenceSync(channel), [connection, channel])

  return { members, enter, update, leave, sync }
}
