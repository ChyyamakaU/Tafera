import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'tafera-theme'

export function resolveInitialTheme() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') return attr
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark' || stored === 'light') return stored
    }
  } catch {
    // Ignore storage restrictions.
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }

  return 'light'
}

export function applyTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  } catch {
    // Ignore storage restrictions.
  }
}

export const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(resolveInitialTheme)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.style.colorScheme = theme
    }
  }, [theme])

  const setTheme = useCallback((nextTheme) => {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light'
    applyTheme(normalized)
    setThemeState(normalized)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  const [fallbackTheme, setFallbackTheme] = useState(resolveInitialTheme)

  const fallbackToggle = useCallback(() => {
    setFallbackTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  if (context) return context

  return {
    theme: fallbackTheme,
    isDark: fallbackTheme === 'dark',
    setTheme: (nextTheme) => {
      const normalized = nextTheme === 'dark' ? 'dark' : 'light'
      applyTheme(normalized)
      setFallbackTheme(normalized)
    },
    toggleTheme: fallbackToggle,
  }
}
