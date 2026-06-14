import { useCallback, useEffect, useState } from 'react'
import type { AdminChannelsResponse } from '../types'
import { ArkNotifyError } from '../utils'
import { useArkNotify } from './useArkNotify'

export function useAdminChannels() {
  const { client } = useArkNotify()
  const [data, setData] = useState<AdminChannelsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ArkNotifyError | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await client.adminChannels()
      setData(result)
    } catch (err) {
      if (err instanceof ArkNotifyError) setError(err)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
