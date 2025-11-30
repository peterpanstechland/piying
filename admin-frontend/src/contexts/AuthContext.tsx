import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { adminApi, ApiError } from '../services/api'

interface User {
  id: string
  username: string
  role: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = adminApi.getToken()
      if (token) {
        try {
          const userData = await adminApi.getCurrentUser()
          setUser(userData)
        } catch (err) {
          // Token is invalid or expired, clear it
          adminApi.clearAuth()
          setUser(null)
        }
      }
      setIsLoading(false)
    }
    checkAuth()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    setIsLoading(true)
    
    try {
      const response = await adminApi.login(username, password)
      setUser(response.user)
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError.message || 'Login failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      await adminApi.logout()
    } catch {
      // Ignore logout errors, still clear local state
    } finally {
      setUser(null)
      setIsLoading(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
