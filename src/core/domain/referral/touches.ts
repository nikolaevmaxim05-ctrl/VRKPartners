// core/domain/referral/touches — касания партнёрских ссылок и first-touch-атрибуция
// (отклонение 11, уточнение владельца 2026-09-29: заявка принадлежит партнёру, по ссылке которого
// посетитель перешёл ПЕРВЫМ в пределах окна атрибуции; последующие переходы партнёра не меняют).
//
// Cookie lead_ref хранит СПИСОК касаний, а не один код: `v2_<code>.<ts>_<code>.<ts>…`, ts — unix-
// секунды первого перехода по этому коду. Разделители `_` и `.` — cookie-безопасные символы, которые
// serialize/encodeURIComponent не трогает (запятая или двоеточие кодировались бы в %2C/%3A). Легаси-значение
// (голый код из прод-версии 2026-09-27) читается как одно касание «сейчас».
// Окно атрибуции (site_settings.referral_attribution_days) middleware НЕ применяет (без БД) —
// только приёмник заявки, поэтому изменение настройки действует сразу на все будущие заявки.
import { normalizeRefCode } from './code'

export type ReferralTouch = { code: string; at: number }

/** Версия формата cookie/localStorage. */
export const REF_COOKIE_VERSION = 'v2'
/** Максимум касаний в cookie (при переполнении заменяется ПОСЛЕДНЕЕ, ранние не трогаются). */
export const REF_MAX_TOUCHES = 8
/** Срок жизни cookie — жёсткий потолок Chrome (400 дней); окно атрибуции не может быть больше. */
export const REF_COOKIE_MAX_DAYS = 400
/** Ключ site_settings и границы окна атрибуции (дней). */
export const REF_ATTRIBUTION_SETTING_KEY = 'referral_attribution_days'
export const REF_ATTRIBUTION_DEFAULT_DAYS = 90
export const REF_ATTRIBUTION_PRESETS = [14, 30, 60, 90, 180, 365] as const
export const REF_ATTRIBUTION_MIN_DAYS = 1
export const REF_ATTRIBUTION_MAX_DAYS = REF_COOKIE_MAX_DAYS

const DAY_SEC = 24 * 3600
const LIST_SEP = '_'
const PAIR_SEP = '.'

function isValidAt(at: unknown): at is number {
  return typeof at === 'number' && Number.isInteger(at) && at > 0
}

/** Один элемент из произвольных данных (тело формы, localStorage) → касание или null. */
export function normalizeTouch(raw: unknown): ReferralTouch | null {
  if (!raw || typeof raw !== 'object') return null
  const { code, at } = raw as { code?: unknown; at?: unknown }
  const norm = normalizeRefCode(code)
  const ts = typeof at === 'string' ? Number(at) : at
  if (!norm || !isValidAt(ts)) return null
  return { code: norm, at: ts }
}

/** Массив из произвольных данных → ≤ max валидных касаний (дубликаты по коду — минимальный ts). */
export function normalizeTouches(raw: unknown, max = REF_MAX_TOUCHES): ReferralTouch[] {
  if (!Array.isArray(raw)) return []
  const touches: ReferralTouch[] = []
  for (const item of raw) {
    const t = normalizeTouch(item)
    if (t) touches.push(t)
  }
  return mergeTouches(touches).slice(0, max)
}

/** Значение cookie → касания. Толерантно: мусор → [], легаси голый код → [{ code, at: now }]. */
export function decodeRefCookie(value: unknown, now: number): ReferralTouch[] {
  if (typeof value !== 'string' || !value) return []
  if (!value.startsWith(REF_COOKIE_VERSION + LIST_SEP)) {
    const legacy = normalizeRefCode(value)
    return legacy ? [{ code: legacy, at: now }] : []
  }
  const touches: ReferralTouch[] = []
  for (const part of value.slice(REF_COOKIE_VERSION.length + 1).split(LIST_SEP)) {
    const dot = part.lastIndexOf(PAIR_SEP)
    if (dot <= 0) continue
    const t = normalizeTouch({ code: part.slice(0, dot), at: Number(part.slice(dot + 1)) })
    if (t) touches.push(t)
  }
  return mergeTouches(touches).slice(0, REF_MAX_TOUCHES)
}

/** Касания → значение cookie (пустой список → пустая строка). */
export function encodeRefCookie(touches: ReadonlyArray<ReferralTouch>): string {
  if (touches.length === 0) return ''
  return REF_COOKIE_VERSION + LIST_SEP + touches.map((t) => `${t.code}${PAIR_SEP}${t.at}`).join(LIST_SEP)
}

/** Объединение списков: по коду остаётся МИНИМАЛЬНЫЙ ts; порядок — по ts, стабильно. */
export function mergeTouches(...lists: ReadonlyArray<ReadonlyArray<ReferralTouch>>): ReferralTouch[] {
  const byCode = new Map<string, ReferralTouch>()
  for (const list of lists) {
    for (const t of list) {
      const cur = byCode.get(t.code)
      if (!cur || t.at < cur.at) byCode.set(t.code, { code: t.code, at: t.at })
    }
  }
  return [...byCode.values()].sort((a, b) => a.at - b.at)
}

/**
 * Новый переход: касания старше maxAgeDays (и «из будущего») отбрасываются; код уже есть —
 * список не меняется (первый ts сохраняется); список полон — заменяется ПОСЛЕДНЕЕ касание.
 */
export function addTouch(
  touches: ReadonlyArray<ReferralTouch>,
  code: string,
  now: number,
  opts: { max?: number; maxAgeDays?: number } = {},
): ReferralTouch[] {
  const max = opts.max ?? REF_MAX_TOUCHES
  const maxAgeSec = (opts.maxAgeDays ?? REF_COOKIE_MAX_DAYS) * DAY_SEC
  const kept = touches.filter((t) => t.at <= now && now - t.at <= maxAgeSec)
  if (kept.some((t) => t.code === code)) return kept
  if (kept.length >= max) return [...kept.slice(0, max - 1), { code, at: now }]
  return [...kept, { code, at: now }]
}

/** Самое раннее касание в окне (now − at ≤ windowDays·86400); «из будущего» игнорируются; иначе null. */
export function pickReferralTouch(
  touches: ReadonlyArray<ReferralTouch>,
  opts: { windowDays: number; now: number },
): ReferralTouch | null {
  const windowSec = opts.windowDays * DAY_SEC
  let best: ReferralTouch | null = null
  for (const t of touches) {
    if (!isValidAt(t.at) || t.at > opts.now || opts.now - t.at > windowSec) continue
    if (!best || t.at < best.at) best = t
  }
  return best
}

/** Значение настройки → целое в [MIN, MAX]; отсутствующее/невалидное → дефолт 90. */
export function parseAttributionDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof n !== 'number' || !Number.isInteger(n)) return REF_ATTRIBUTION_DEFAULT_DAYS
  if (n < REF_ATTRIBUTION_MIN_DAYS || n > REF_ATTRIBUTION_MAX_DAYS) return REF_ATTRIBUTION_DEFAULT_DAYS
  return n
}

/** Строгая проверка для формы/PATCH: целое в [MIN, MAX] или сообщение uk-UA. */
export const REF_ATTRIBUTION_RANGE_MESSAGE = `Вікно атрибуції: ціле число від ${REF_ATTRIBUTION_MIN_DAYS} до ${REF_ATTRIBUTION_MAX_DAYS} днів`
export function planAttributionDays(raw: unknown): { ok: true; days: number } | { ok: false; message: string } {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof n !== 'number' || !Number.isInteger(n) || n < REF_ATTRIBUTION_MIN_DAYS || n > REF_ATTRIBUTION_MAX_DAYS) {
    return { ok: false, message: REF_ATTRIBUTION_RANGE_MESSAGE }
  }
  return { ok: true, days: n }
}
