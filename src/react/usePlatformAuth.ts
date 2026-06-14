import { useCallback, useEffect, useState } from 'react'
import type { LoginInput, User } from '../types'
import { ArkNotifyError } from '../utils'
import { useArkNotify } from './useArkNotify'

const TOKEN_STORAGE_KEY = 'ark-notify-js-token'

export interface UsePlatformAuthOptions {
  storageKey?: string
  persist?: boolean
}

export interface UsePlatformAuthResult {
  user: User | null
  token: string | null
  loading: boolean
  error: ArkNotifyError | null
  login: (input: LoginInput) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  isAuthenticated: boolean
}

export function usePlatformAuth(options: UsePlatformAuthOptions = {}): UsePlatformAuthResult {
  const { client } = useArkNotify()
  const storageKey = options.storageKey ?? TOKEN_STORAGE_KEY
  const persist = options.persist ?? true

  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => {
    if (!persist || typeof window === 'undefined') return null
    return localStorage.getItem(storageKey)
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ArkNotifyError | null>(null)

  const saveToken = useCallback(
    (newToken: string | null) => {
      setToken(newToken)
      client.setToken(newToken)
      if (persist && typeof window !== 'undefined') {
        if (newToken) {
          localStorage.setItem(storageKey, newToken)
        } else {
          localStorage.removeItem(storageKey)
        }
      }
    },
    [client, persist, storageKey]
  )

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      client.setToken(token)
      const { user: fetched } = await client.me()
      setUser(fetched)
    } catch (err) {
      setUser(null)
      if (err instanceof ArkNotifyError) {
        setError(err)
        if (err.status === 401) saveToken(null)
      }
    } finally {
      setLoading(false)
    }
  }, [client, token, saveToken])

  useEffect(() => {
    if (token) {
      client.setToken(token)
      void refreshUser()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true)
      setError(null)
      try {
        const res = await client.login(input)
        saveToken(res.token)
        setUser(res.user)
      } catch (err) {
        if (err instanceof ArkNotifyError) setError(err)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client, saveToken]
  )

  const logout = useCallback(() => {
    saveToken(null)
    setUser(null)
    setError(null)
  }, [saveToken])

  return {
    user,
    token,
    loading,
    error,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user && !!token,
  }
}
