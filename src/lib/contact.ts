// Нормалізація значення контакту, яке КОПІЮЄТЬСЯ (не те, що показано на екрані).
// Телефон → чистий E.164 для набору (+380XXXXXXXXX), email → trim + lowercase.
import { normalizePhone } from '@/lib/phone'

export type ContactType = 'phone' | 'email'

export function normalizeContactValue(value: string, type: ContactType): string {
  if (type === 'phone') return normalizePhone(value)
  return value.trim().toLowerCase()
}
