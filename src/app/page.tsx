'use client'

import TelegramGame from '@/components/telegram-game'
import { TelegramProvider } from '@/components/telegram-provider'

export default function Home() {
  return (
    <TelegramProvider>
      <TelegramGame />
    </TelegramProvider>
  )
}