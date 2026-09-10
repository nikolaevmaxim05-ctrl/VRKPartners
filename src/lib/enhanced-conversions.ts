// LEGACY-адаптер (Фаза 1): нормалізація/хеш — у @core/domain/funnel/enhanced-conversions;
// тут лишається лише браузерний виклик gtag('set','user_data') (Фаза 2 → features/landing/lib).
//
// Інваріанти безпеки: ніколи не кидає, нічого не логує, не пише у storage; сирі email/телефон
// у dataLayer/gtag('event') НІКОЛИ не потрапляють — лише sha256-хеші через gtag('set','user_data').

import { normalizeEmail, normalizePhoneE164, sha256Hex } from '@core/domain/funnel/enhanced-conversions'

export { normalizeEmail, normalizePhoneE164, sha256Hex } from '@core/domain/funnel/enhanced-conversions'

export async function setEnhancedConversionUserData(data: {
  email?: string
  phone?: string
}): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (typeof window.gtag !== 'function') return

    const subtle = (typeof crypto !== 'undefined' ? crypto : globalThis.crypto)?.subtle
    if (!subtle) return

    const userData: Record<string, string> = {}

    if (data.email) {
      const normalized = normalizeEmail(data.email)
      if (normalized) {
        const hash = await sha256Hex(normalized)
        if (hash) userData.sha256_email_address = hash
      }
    }

    if (data.phone) {
      const normalized = normalizePhoneE164(data.phone)
      if (normalized) {
        const hash = await sha256Hex(normalized)
        if (hash) userData.sha256_phone_number = hash
      }
    }

    if (Object.keys(userData).length === 0) return

    window.gtag('set', 'user_data', userData)
  } catch {
    // Аналітика ніколи не повинна ламати UI
  }
}
