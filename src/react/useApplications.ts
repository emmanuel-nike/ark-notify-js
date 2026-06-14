import { useCallback, useEffect, useState } from 'react'
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '../types'
import { ArkNotifyError } from '../utils'
import { useArkNotify } from './useArkNotify'

export interface UseApplicationsResult {
  apps: Application[]
  loading: boolean
  error: ArkNotifyError | null
  refresh: () => Promise<void>
  create: (input: CreateApplicationInput) => Promise<Application>
  update: (id: string, input: UpdateApplicationInput) => Promise<Application>
  remove: (id: string) => Promise<void>
  regenerateSecret: (id: string) => Promise<Application>
  getById: (id: string) => Promise<Application>
}

export function useApplications(): UseApplicationsResult {
  const { client } = useArkNotify()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ArkNotifyError | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { apps: list } = await client.listApplications()
      setApps(list)
    } catch (err) {
      if (err instanceof ArkNotifyError) setError(err)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (input: CreateApplicationInput) => {
      const { app } = await client.createApplication(input)
      setApps((prev) => [...prev, app])
      return app
    },
    [client]
  )

  const update = useCallback(
    async (id: string, input: UpdateApplicationInput) => {
      const { app } = await client.updateApplication(id, input)
      setApps((prev) => prev.map((a) => (a.id === id ? app : a)))
      return app
    },
    [client]
  )

  const remove = useCallback(
    async (id: string) => {
      await client.deleteApplication(id)
      setApps((prev) => prev.filter((a) => a.id !== id))
    },
    [client]
  )

  const regenerateSecret = useCallback(
    async (id: string) => {
      const { app } = await client.regenerateSecret(id)
      setApps((prev) => prev.map((a) => (a.id === id ? app : a)))
      return app
    },
    [client]
  )

  const getById = useCallback(
    async (id: string) => {
      const { app } = await client.getApplication(id)
      return app
    },
    [client]
  )

  return { apps, loading, error, refresh, create, update, remove, regenerateSecret, getById }
}
