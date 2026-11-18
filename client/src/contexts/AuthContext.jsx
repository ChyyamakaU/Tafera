import { createContext, useContext, useEffect, useState } from 'react'
import {
  checkAuth as checkAuthService,
  login as loginService,
  register as registerService,
  logout as logoutService,
} from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const isAuthenticated = !!user

  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      try {
        const { isAuthenticated, user } = await checkAuthService()
        if (!cancelled) {
          setUser(isAuthenticated ? user : null)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (credentials) => {
    const { data } = await loginService(credentials)
    setUser(data.user)
    return data
  }

  const register = async (userData) => {
    const { data } = await registerService(userData)
    // Registration creates an authenticated session automatically per backend contract.
    setUser(data.user)
    return data
  }

  const logout = async () => {
    await logoutService()
    setUser(null)
  }

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    checkAuth: checkAuthService,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
