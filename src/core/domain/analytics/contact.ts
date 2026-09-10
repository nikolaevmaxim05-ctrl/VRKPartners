// core/domain/analytics/contact — нормалізація значення контакту, що КОПІЮЄТЬСЯ,
// і рішення для кліку по контакту (чисті функції, перенесено з lib/contact.ts).
import { normalizePhone } from '../lead/phone'

export type ContactType = 'phone' | 'email'

export function normalizeContactValue(value: string, type: ContactType): string {
  if (type === 'phone') return normalizePhone(value)
  return value.trim().toLowerCase()
}

/**
 * Рішення для лівого кліку по контакту:
 *  - Email (будь-який пристрій): лише копіювання, перехід mailto: блокуємо.
 *  - Телефон на ПК (не тач): лише копіювання, tel: блокуємо.
 *  - Телефон на тач-пристрої: не блокуємо — спрацьовує нативний tel:.
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
