// core/domain/referral/code — реферальний код партнера (відхилення 11 AGENTS.md).
// Код: випадковий, lower-case латиниця й цифри без двозначних символів (0/o, 1/l/i), 8 знаків;
// формат зберігання ширший ([a-z0-9]{3,40}) — під CHECK міграції 035. Чистий модуль: генератор
// отримує джерело випадковості ззовні (node:crypto — в інфраструктурі/сценарії).

export const REF_CODE_RE = /^[a-z0-9]{3,40}$/
export const REF_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const REF_CODE_LENGTH = 8

/** Імʼя first-party cookie з кодом (HttpOnly, без PII). */
export const REF_COOKIE = 'lead_ref'
/** Query-параметр: /?ref=<code>. */
export const REF_QUERY_KEY = 'ref'
/** Термін життя cookie (last-touch: новий перехід перезаписує). */
export const REF_TTL_DAYS = 90
/** Канонічний шлях для партнера: /r/<code> → 302 на /?ref=<code>. */
export const REF_PATH_PREFIX = '/r/'

/** Нормалізує сирий код (trim, lower-case); невалідний → null (ніколи не помилка для заявки). */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  return REF_CODE_RE.test(code) ? code : null
}

/** Випадковий код: randomInt(maxExclusive) → [0, maxExclusive). */
export function generateRefCode(randomInt: (maxExclusive: number) => number): string {
  let out = ''
  for (let i = 0; i < REF_CODE_LENGTH; i++) out += REF_CODE_ALPHABET[randomInt(REF_CODE_ALPHABET.length)]
  return out
}

/** Посилання партнеру: <site>/r/<code> (без подвійного слеша). */
export function buildReferralUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${REF_PATH_PREFIX}${code}`
}

/** Код зі шляху /r/<code> (decodeURIComponent під try) або null, якщо шлях не /r/… чи код невалідний. */
export function refCodeFromPath(pathname: string): string | null {
  if (!pathname.startsWith(REF_PATH_PREFIX)) return null
  const rest = pathname.slice(REF_PATH_PREFIX.length)
  if (!rest || rest.includes('/')) return null
  try {
    return normalizeRefCode(decodeURIComponent(rest))
  } catch {
    return null
  }
}
