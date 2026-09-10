// core/domain/funnel/adjustments — правила корекцій Google Ads (RETRACT / RESTATE).
// Чиста частина lib/conversion-adjustments.ts (Фаза 1). Запис у БД і відправка в
// Sheets — в інфраструктурі.

export type AdjustmentType = 'retract' | 'restate'

/**
 * C15: повторний RETRACT дозволяємо, лише якщо конверсію ПЕРЕекспортували ПІСЛЯ
 * попереднього retract (є що відкликати знову). Інакше — дубль, пропускаємо.
 * Обидва аргументи — ISO-рядки або null; exportedAt=null означає «не експортовано» (0).
 */
export function shouldSuppressRetract(
  lastRetractAt: string | null | undefined,
  exportedAt: string | null | undefined,
): boolean {
  if (!lastRetractAt) return false
  const exported = exportedAt ? new Date(exportedAt).getTime() : 0
  const lastRetract = new Date(lastRetractAt).getTime()
  return exported <= lastRetract
}

/** RETRACT іде без суми/валюти; RESTATE — з переданою сумою (currency резолвить caller). */
export function normalizeAdjustmentValue(
  type: AdjustmentType,
  value: number | null | undefined,
  currency: string | null | undefined,
): { value: number | null; currency: string | null } {
  if (type === 'retract') return { value: null, currency: null }
  return { value: value ?? null, currency: currency ?? null }
}
