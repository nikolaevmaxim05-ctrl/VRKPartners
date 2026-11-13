// core/domain/lead/email — нормализация email (разделы 8 и 15).
// В БД хранится trim().toLowerCase(); точки в gmail убираются ТОЛЬКО перед хешем
// (Enhanced Conversions на сайте и офлайн-выгрузка пользуются одной функцией).

/** Для сохранения/сравнения: trim + lowercase. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Для SHA-256: как normalizeEmail, а для gmail.com/googlemail.com — без точек в части до `@`. */
export function emailForHash(raw: string): string {
  const email = normalizeEmail(raw)
  const at = email.lastIndexOf('@')
  if (at === -1) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return GMAIL_DOMAINS.has(domain) ? `${local.replace(/\./g, '')}@${domain}` : email
}
