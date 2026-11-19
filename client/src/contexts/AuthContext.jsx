import { createContext, useContext, useEffect, useState } from 'react'
import {
  checkAuth as checkAuthService,
  login as loginService,
  register as registerService,
  logout as logoutService,
} from '../services/auth'

export const AuthContext = createContext(null)

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
    const response = await loginService(credentials)
    setUser(response.user)
    return response
  }

  const register = async (userData) => {
    const response = await registerService(userData)
    // Registration creates an authenticated session automatically per backend contract.
    setUser(response.user)
    return response
  }

  const logout = async () => {
    try {
      await logoutService()
    } finally {
      setUser(null)
    }
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
