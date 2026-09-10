// LEGACY-адаптер (Фаза 1): чисті UTM-правила — у @core/domain/lead/utm.
// Тут лишається лише браузерна частина (sessionStorage) — Фаза 2 → features/landing/lib.
import { UTM_STORAGE_KEY, normalizeUtm, type UtmData } from '@core/domain/lead/utm'

export {
  UTM_KEYS,
  UTM_URL_KEYS,
  UTM_STORAGE_KEY,
  UTM_LABELS,
  normalizeUtm,
  hasUtm,
  utmEntries,
  formatUtmSummary,
} from '@core/domain/lead/utm'
export type { UtmKey, UtmData } from '@core/domain/lead/utm'

// Дістати збережені UTM-мітки з sessionStorage. SSR-safe — поза браузером повертає {}.
export function getStoredUtm(): UtmData {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY)
    if (!raw) return {}
    return normalizeUtm(JSON.parse(raw))
  } catch {
    return {}
  }
}
