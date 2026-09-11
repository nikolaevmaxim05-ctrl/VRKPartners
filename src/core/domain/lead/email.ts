// core/domain/lead/email — нормалізація email (розділи 8 і 15).
// У БД зберігається trim().toLowerCase(); крапки в gmail прибираються ТІЛЬКИ перед хешем
// (Enhanced Conversions на сайті та офлайн-вигрузка користуються однією функцією).

/** Для збереження/порівняння: trim + lowercase. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Для SHA-256: як normalizeEmail, а для gmail.com/googlemail.com — без крапок у частині до `@`. */
export function emailForHash(raw: string): string {
  const email = normalizeEmail(raw)
  const at = email.lastIndexOf('@')
  if (at === -1) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return GMAIL_DOMAINS.has(domain) ? `${local.replace(/\./g, '')}@${domain}` : email
}
