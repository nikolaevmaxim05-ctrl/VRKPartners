// Нормалізація значення контакту, яке КОПІЮЄТЬСЯ (не те, що показано на екрані).
// Телефон → чистий E.164 для набору (+380XXXXXXXXX), email → trim + lowercase.
import { normalizePhone } from '@/lib/phone'

export type ContactType = 'phone' | 'email'

export function normalizeContactValue(value: string, type: ContactType): string {
  if (type === 'phone') return normalizePhone(value)
  return value.trim().toLowerCase()
}

/**
 * Рішення для лівого кліку по контакту (чиста, тестована функція).
 *
 *  - Email (будь-який пристрій): лише копіювання, перехід mailto: блокуємо
 *    (щоб на ПК не відкривався Outlook/поштовий клієнт).
 *  - Телефон на ПК (не тач): лише копіювання, tel: блокуємо.
 *  - Телефон на тач-пристрої: НЕ блокуємо — спрацьовує нативний tel:
 *    (відкривається звонилка з номером); копіювання/toast не потрібні.
 *
 * isTouchDevice визначається в компоненті в момент кліку через
 * matchMedia('(hover: none) and (pointer: coarse)') — без user-agent-снифінгу.
 */
export function resolveContactClick(
  type: ContactType,
  isTouchDevice: boolean
): { preventDefault: boolean; copy: boolean } {
  if (type === 'phone' && isTouchDevice) {
    return { preventDefault: false, copy: false }
  }
  return { preventDefault: true, copy: true }
}
