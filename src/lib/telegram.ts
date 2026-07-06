/**
 * Telegram WebApp utilities — haptic feedback, sharing, safe areas.
 * All functions are no-ops when running outside Telegram (desktop/web preview).
 */

/** Check if running inside Telegram WebApp */
export function isTelegram(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as unknown as { Telegram?: { WebApp?: object } }).Telegram?.WebApp
}

/** Get the Telegram WebApp instance (or null outside Telegram) */
function getWebApp() {
  if (typeof window === 'undefined') return null
  const w = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
  return w ?? null
}

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  sendData: (data: string) => void
  switchToInlineQuery: (query: string) => void
  openTelegramLink: (url: string) => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  showPopup: (params: { title?: string; message: string; buttons?: Array<{ type: string; text: string }> }) => void
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
      is_premium?: boolean
    }
    start_param?: string
  }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  viewportHeight: number
  viewportStableHeight: number
  headerColor: string
  backgroundColor: string
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  enableClosingConfirmation: () => void
  disableVerticalSwipes: () => void
}

/** Initialize the Telegram WebApp (call on mount) */
export function initTelegram() {
  const app = getWebApp()
  if (!app) return
  app.ready()
  app.expand()
  app.enableClosingConfirmation()
  app.disableVerticalSwipes()
  // Set dark header to match the game
  app.setHeaderColor('#1a1410')
  app.setBackgroundColor('#1a1410')
}

/** Get Telegram user data (or null outside Telegram) */
export function getTelegramUser() {
  const app = getWebApp()
  return app?.initDataUnsafe?.user ?? null
}

/** Get the start parameter passed to the bot */
export function getStartParam() {
  const app = getWebApp()
  return app?.initDataUnsafe?.start_param ?? null
}

// ---- Haptic Feedback ----

export function hapticLight() {
  getWebApp()?.HapticFeedback?.impactOccurred('light')
}

export function hapticMedium() {
  getWebApp()?.HapticFeedback?.impactOccurred('medium')
}

export function hapticHeavy() {
  getWebApp()?.HapticFeedback?.impactOccurred('heavy')
}

export function hapticSuccess() {
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
}

export function hapticError() {
  getWebApp()?.HapticFeedback?.notificationOccurred('error')
}

export function hapticWarning() {
  getWebApp()?.HapticFeedback?.notificationOccurred('warning')
}

export function hapticSelection() {
  getWebApp()?.HapticFeedback?.selectionChanged()
}

// ---- Telegram Main Button ----

export function showMainButton(text: string, onClick: () => void) {
  const app = getWebApp()
  if (!app) return
  app.MainButton.text = text
  app.MainButton.color = '#92400e' // amber-800
  app.MainButton.textColor = '#fff'
  app.MainButton.show()
  app.MainButton.onClick(onClick)
}

export function hideMainButton() {
  const app = getWebApp()
  if (!app) return
  app.MainButton.hide()
}

export function setMainButtonText(text: string) {
  const app = getWebApp()
  if (!app) return
  app.MainButton.text = text
}

// ---- Back Button ----

export function showBackButton(onClick: () => void) {
  const app = getWebApp()
  if (!app) return
  app.BackButton.show()
  app.BackButton.onClick(onClick)
}

export function hideBackButton() {
  const app = getWebApp()
  if (!app) return
  app.BackButton.hide()
}

// ---- Share via Telegram ----

export function shareToTelegram(text: string) {
  const app = getWebApp()
  if (!app) {
    // Fallback to Web Share API
    if (navigator.share) {
      navigator.share({ title: 'Relapa Freeze Dance', text })
    } else {
      navigator.clipboard.writeText(text)
    }
    return
  }
  // Use openTelegramLink to share to any chat
  const encoded = encodeURIComponent(text)
  app.openTelegramLink(`https://t.me/share/url?text=${encoded}`)
}

// ---- Popup ----

export function showTelegramPopup(title: string, message: string) {
  const app = getWebApp()
  if (!app) return
  app.showPopup({ title, message })
}