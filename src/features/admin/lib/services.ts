// Значення `leads.service` для UI адмінки (підпис і опції фільтра).
//
// Форма сайту пише в service готову україномовну назву (не код), тому «переклад» тотожний,
// а невідомі/старі значення показуємо як є. Поле «Послуга» з форми прибрано у Фазі 3
// (ніколи не рендерилось), тож список нижче — лише для фільтрації ІСТОРИЧНИХ лідів.

/**
 * Значення з БД → назва для UI.
 * - null/undefined/'' → '—' (плейсхолдер для таблиць)
 * - будь-яке інше значення — вже готова україномовна назва.
 */
export function getServiceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value
}

/** Історичні значення service, які могли записати старі версії форми. */
const LEGACY_SERVICES = ['Аудит', 'Стратегія', 'Прорахунок', 'Підготовка сайту'] as const

/** Список { value, label } для селектів/фільтрів адмінки. */
export const SERVICE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = LEGACY_SERVICES.map((s) => ({
  value: s,
  label: s,
}))
