// Переклад кодів послуг з БД (leads.service) у назви для UI адмінки.
//
// На відміну від донора (усмішка зберігала англ. коди), лендінг VRK записує
// у service одразу україномовну назву з config/site.ts (audit.services) —
// тому "переклад" тут тотожний, а невідомі/старі значення показуємо як є.

import { audit } from '@/config/site'

/**
 * Значення з БД → назва для UI.
 * - null/undefined/'' → '—' (плейсхолдер для таблиць)
 * - будь-яке інше значення — вже готова україномовна назва.
 */
export function getServiceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value
}

/**
 * Список { value, label } для селектів/фільтрів адмінки.
 * Джерело — той самий список послуг, що бачить користувач у формі лендінгу.
 */
export const SERVICE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  audit.services.map((s) => ({ value: s, label: s }))
