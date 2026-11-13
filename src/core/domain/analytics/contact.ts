// core/domain/analytics/contact — нормализация значения контакта, которое КОПИРУЕТСЯ,
// и решение для клика по контакту (чистые функции, перенесено из lib/contact.ts).
import { normalizePhone } from '../lead/phone'

export type ContactType = 'phone' | 'email'

export function normalizeContactValue(value: string, type: ContactType): string {
  if (type === 'phone') return normalizePhone(value)
  return value.trim().toLowerCase()
}

/**
 * Решение для левого клика по контакту:
 *  - Email (любое устройство): только копирование, переход mailto: блокируем.
 *  - Телефон на ПК (не тач): только копирование, tel: блокируем.
 *  - Телефон на тач-устройстве: не блокируем — срабатывает нативный tel:.
 */
export function resolveContactClick(
  type: ContactType,
  isTouchDevice: boolean,
): { preventDefault: boolean; copy: boolean } {
  if (type === 'phone' && isTouchDevice) {
    return { preventDefault: false, copy: false }
  }
  return { preventDefault: true, copy: true }
}
