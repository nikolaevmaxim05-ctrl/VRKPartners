// Enhanced Conversions на сайте: gtag('set','user_data', { sha256_email_address, sha256_phone_number })
// ДО события-конверсии (раздел 15). Нормализация/хеш — в @core/domain/funnel/enhanced-conversions.
//
// Инварианты безопасности: никогда не бросает, ничего не логирует, не пишет в storage; сырые email/телефон
// в dataLayer/gtag('event') НИКОГДА не попадают — только sha256-хеши через gtag('set','user_data').

import { hashableUserData, sha256Hex } from '@core/domain/funnel/enhanced-conversions'

export async function setEnhancedConversionUserData(data: {
  email?: string
  phone?: string
}): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (typeof window.gtag !== 'function') return

    const subtle = (typeof crypto !== 'undefined' ? crypto : globalThis.crypto)?.subtle
    if (!subtle) return

    const normalized = hashableUserData(data)
    const userData: Record<string, string> = {}

    if (normalized.email) {
      const hash = await sha256Hex(normalized.email)
      if (hash) userData.sha256_email_address = hash
    }
    if (normalized.phone) {
      const hash = await sha256Hex(normalized.phone)
      if (hash) userData.sha256_phone_number = hash
    }

    if (Object.keys(userData).length === 0) return

    window.gtag('set', 'user_data', userData)
  } catch {
    // Аналитика никогда не должна ломать UI
  }
}
