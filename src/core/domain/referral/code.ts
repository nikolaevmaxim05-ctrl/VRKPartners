// core/domain/referral/code — реферальный код партнёра (отклонение 11 AGENTS.md).
// Код: случайный, lower-case латиница и цифры без двусмысленных символов (0/o, 1/l/i), 8 знаков;
// формат хранения шире ([a-z0-9]{3,40}) — под CHECK миграции 035. Чистый модуль: генератор
// получает источник случайности снаружи (node:crypto — в инфраструктуре/сценарии).

export const REF_CODE_RE = /^[a-z0-9]{3,40}$/
export const REF_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const REF_CODE_LENGTH = 8

/** Имя first-party cookie со списком касаний (HttpOnly, без PII; формат — touches.ts). */
export const REF_COOKIE = 'lead_ref'
/** Query-параметр: /?ref=<code>. */
export const REF_QUERY_KEY = 'ref'
/** Канонический путь для партнёра: /r/<code> → 302 на /?ref=<code>. */
export const REF_PATH_PREFIX = '/r/'

/** Нормализует сырой код (trim, lower-case); невалидный → null (никогда не ошибка для заявки). */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  return REF_CODE_RE.test(code) ? code : null
}

/** Случайный код: randomInt(maxExclusive) → [0, maxExclusive). */
export function generateRefCode(randomInt: (maxExclusive: number) => number): string {
  let out = ''
  for (let i = 0; i < REF_CODE_LENGTH; i++) out += REF_CODE_ALPHABET[randomInt(REF_CODE_ALPHABET.length)]
  return out
}

/** Ссылка партнёру: <site>/r/<code> (без двойного слеша). */
export function buildReferralUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${REF_PATH_PREFIX}${code}`
}

/** Код из пути /r/<code> (decodeURIComponent под try) или null, если путь не /r/… или код невалидный. */
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
