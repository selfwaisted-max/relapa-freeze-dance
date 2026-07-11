'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  isTelegram,
  initTelegram,
  getTelegramUser,
  type TelegramWebApp,
} from '@/lib/telegram'

type TelegramUserData = {
  id: number
  firstName: string
  lastName: string
  username: string | null
  isPremium: boolean
  fullName: string
}

type TelegramContextValue = {
  isTelegramApp: boolean
  user: TelegramUserData | null
  colorScheme: 'light' | 'dark'
}

const TelegramContext = createContext<TelegramContextValue>({
  isTelegramApp: false,
  user: null,
  colorScheme: 'dark',
})

export function useTelegram() {
  return useContext(TelegramContext)
}

function parseUser(raw: NonNullable<TelegramWebApp['initDataUnsafe']>['user']): TelegramUserData | null {
  if (!raw) return null
  return {
    id: raw.id,
    firstName: raw.first_name ?? '',
    lastName: raw.last_name ?? '',
    username: raw.username ?? null,
    isPremium: raw.is_premium ?? false,
    fullName: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || 'Dancer',
  }
}

function getInitialState() {
  if (typeof window === 'undefined') {
    return { isTelegramApp: false, user: null as TelegramUserData | null, colorScheme: 'dark' as const }
  }
  const inTelegram = isTelegram()
  if (inTelegram) {
    initTelegram()
    const rawUser = getTelegramUser()
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    return {
      isTelegramApp: true,
      user: parseUser(rawUser),
      colorScheme: (app?.colorScheme ?? 'dark') as 'light' | 'dark',
    }
  }
  return { isTelegramApp: false, user: null as TelegramUserData | null, colorScheme: 'dark' as const }
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(getInitialState)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Listen for theme changes if in Telegram
    const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    if (app) {
      const handler = () => {
        setState((prev) => prev.isTelegramApp ? { ...prev, colorScheme: app.colorScheme as 'light' | 'dark' } : prev)
      }
      ;(app as unknown as { onEvent?: (event: string, cb: () => void) => void }).onEvent?.('themeChanged', handler)
    }
  }, [])

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  )
}