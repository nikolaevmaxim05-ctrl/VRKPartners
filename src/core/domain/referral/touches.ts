// core/domain/referral/touches — касання партнерських посилань і first-touch-атрибуція
// (відхилення 11, уточнення власника 2026-09-29: заявка належить партнеру, за посиланням якого
// відвідувач перейшов ПЕРШИМ протягом вікна атрибуції; наступні переходи партнера не змінюють).
//
// Cookie lead_ref зберігає СПИСОК касань, а не один код: `v2_<code>.<ts>_<code>.<ts>…`, ts — unix-
// секунди першого переходу за цим кодом. Роздільники `_` і `.` — cookie-безпечні символи, які
// serialize/encodeURIComponent не чіпає (кома чи двокрапка кодувалися б у %2C/%3A). Легасі-значення
// (голий код із прод-версії 2026-09-27) читається як одне касання «зараз».
// Вікно атрибуції (site_settings.referral_attribution_days) middleware НЕ застосовує (без БД) —
// лише приймач заявки, тому зміна налаштування діє одразу на всі майбутні заявки.
import { normalizeRefCode } from './code'

export type ReferralTouch = { code: string; at: number }

/** Версія формату cookie/localStorage. */
export const REF_COOKIE_VERSION = 'v2'
/** Максимум касань у cookie (при переповненні замінюється ОСТАННЄ, ранні не чіпаються). */
export const REF_MAX_TOUCHES = 8
/** Термін життя cookie — жорстка стеля Chrome (400 днів); вікно атрибуції не може бути більшим. */
export const REF_COOKIE_MAX_DAYS = 400
/** Ключ site_settings і межі вікна атрибуції (днів). */
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

/** Один елемент з довільних даних (тіло форми, localStorage) → касання або null. */
export function normalizeTouch(raw: unknown): ReferralTouch | null {
  if (!raw || typeof raw !== 'object') return null
  const { code, at } = raw as { code?: unknown; at?: unknown }
  const norm = normalizeRefCode(code)
  const ts = typeof at === 'string' ? Number(at) : at
  if (!norm || !isValidAt(ts)) return null
  return { code: norm, at: ts }
}

/** Масив із довільних даних → ≤ max валідних касань (дублікати за кодом — мінімальний ts). */
export function normalizeTouches(raw: unknown, max = REF_MAX_TOUCHES): ReferralTouch[] {
  if (!Array.isArray(raw)) return []
  const touches: ReferralTouch[] = []
  for (const item of raw) {
    const t = normalizeTouch(item)
    if (t) touches.push(t)
  }
  return mergeTouches(touches).slice(0, max)
}

/** Значення cookie → касання. Толерантно: мусор → [], легасі голий код → [{ code, at: now }]. */
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

/** Касання → значення cookie (порожній список → порожній рядок). */
export function encodeRefCookie(touches: ReadonlyArray<ReferralTouch>): string {
  if (touches.length === 0) return ''
  return REF_COOKIE_VERSION + LIST_SEP + touches.map((t) => `${t.code}${PAIR_SEP}${t.at}`).join(LIST_SEP)
}

/** Обʼєднання списків: за кодом лишається МІНІМАЛЬНИЙ ts; порядок — за ts, стабільно. */
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
 * Новий перехід: касання старші за maxAgeDays (і «з майбутнього») відкидаються; код уже є —
 * список не змінюється (перший ts зберігається); список повний — замінюється ОСТАННЄ касання.
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

/** Найраніше касання у вікні (now − at ≤ windowDays·86400); «з майбутнього» ігноруються; інакше null. */
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

/** Значення налаштування → ціле у [MIN, MAX]; відсутнє/невалідне → дефолт 90. */
export function parseAttributionDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof n !== 'number' || !Number.isInteger(n)) return REF_ATTRIBUTION_DEFAULT_DAYS
  if (n < REF_ATTRIBUTION_MIN_DAYS || n > REF_ATTRIBUTION_MAX_DAYS) return REF_ATTRIBUTION_DEFAULT_DAYS
  return n
}

/** Строга перевірка для форми/PATCH: ціле у [MIN, MAX] або повідомлення uk-UA. */
export const REF_ATTRIBUTION_RANGE_MESSAGE = `Вікно атрибуції: ціле число від ${REF_ATTRIBUTION_MIN_DAYS} до ${REF_ATTRIBUTION_MAX_DAYS} днів`
export function planAttributionDays(raw: unknown): { ok: true; days: number } | { ok: false; message: string } {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof n !== 'number' || !Number.isInteger(n) || n < REF_ATTRIBUTION_MIN_DAYS || n > REF_ATTRIBUTION_MAX_DAYS) {
    return { ok: false, message: REF_ATTRIBUTION_RANGE_MESSAGE }
  }
  return { ok: true, days: n }
}
