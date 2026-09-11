// Enhanced Conversions на сайті: gtag('set','user_data', { sha256_email_address, sha256_phone_number })
// ДО події-конверсії (розділ 15). Нормалізація/хеш — у @core/domain/funnel/enhanced-conversions.
//
// Інваріанти безпеки: ніколи не кидає, нічого не логує, не пише у storage; сирі email/телефон
// у dataLayer/gtag('event') НІКОЛИ не потрапляють — лише sha256-хеші через gtag('set','user_data').

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
    // Аналітика ніколи не повинна ламати UI
  }
}
