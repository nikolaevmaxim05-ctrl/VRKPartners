// core/domain/funnel/adjustments — правила корректировок Google Ads (RETRACT / RESTATE).
// Чистая часть lib/conversion-adjustments.ts (Фаза 1). Запись в БД и отправка в
// Sheets — в инфраструктуре.

export type AdjustmentType = 'retract' | 'restate'

/**
 * C15: повторный RETRACT разрешаем, только если конверсию ПЕРЕэкспортировали ПОСЛЕ
 * предыдущего retract (есть что отзывать снова). Иначе — дубль, пропускаем.
 * Оба аргумента — ISO-строки или null; exportedAt=null означает «не экспортировано» (0).
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

/** RETRACT идёт без суммы/валюты; RESTATE — с переданной суммой (currency резолвит caller). */
export function normalizeAdjustmentValue(
  type: AdjustmentType,
  value: number | null | undefined,
  currency: string | null | undefined,
): { value: number | null; currency: string | null } {
  if (type === 'retract') return { value: null, currency: null }
  return { value: value ?? null, currency: currency ?? null }
}
