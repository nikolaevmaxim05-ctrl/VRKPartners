// core/domain/referral/link-rules — правила створення/редагування реферального посилання.
// Код генерує сервер (рішення власника 5: лише випадковий, незмінний); з клієнта приймаються
// назва партнера, нотатки, вмикач. Повідомлення — uk-UA (віддаються в 400).

export type ReferralLink = {
  id: string
  name: string
  code: string
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Довідник для фільтрів/бейджів (без нотаток і авторства). */
export type ReferralLinkRef = Pick<ReferralLink, 'id' | 'name' | 'code' | 'is_active'>

/** Статистика по заявках (v1: лише заявки, без візитів — рішення власника 9). */
export type ReferralLinkStats = {
  link_id: string
  total: number
  last30: number
  last_at: string | null
}

export const REF_NAME_MAX = 80
export const REF_NOTES_MAX = 500

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

export const REF_ERRORS = {
  name: `Назва партнера: 1–${REF_NAME_MAX} символів`,
  notes: `Нотатки: до ${REF_NOTES_MAX} символів`,
  codeImmutable: 'Код не можна змінити — створіть нове посилання',
  nothing: 'Нічого оновлювати',
  nameTaken: 'Посилання з такою назвою вже існує',
  codeTaken: 'Посилання з таким кодом вже існує',
  notFound: 'Посилання не знайдено',
  hasLeads: (n: number) => `Посилання має ${n} заявок — вимкніть його замість видалення`,
} as const

function normalizeNotes(raw: unknown): Plan<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: REF_ERRORS.notes }
  const notes = raw.trim()
  if (notes.length > REF_NOTES_MAX) return { ok: false, message: REF_ERRORS.notes }
  return { ok: true, value: notes || null }
}

function normalizeName(raw: unknown): Plan<string> {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || name.length > REF_NAME_MAX) return { ok: false, message: REF_ERRORS.name }
  return { ok: true, value: name }
}

export type NewReferralLinkBody = { name?: unknown; notes?: unknown }

export function planNewReferralLink(body: NewReferralLinkBody): Plan<{ name: string; notes: string | null }> {
  const name = normalizeName(body.name)
  if (!name.ok) return name
  const notes = normalizeNotes(body.notes)
  if (!notes.ok) return notes
  return { ok: true, value: { name: name.value, notes: notes.value } }
}

export type ReferralLinkPatchBody = { name?: unknown; notes?: unknown; is_active?: unknown; code?: unknown }

export function planReferralLinkPatch(body: ReferralLinkPatchBody): Plan<{ name?: string; notes?: string | null; is_active?: boolean }> {
  if ('code' in body && body.code !== undefined) return { ok: false, message: REF_ERRORS.codeImmutable }
  const out: { name?: string; notes?: string | null; is_active?: boolean } = {}
  if (body.name !== undefined) {
    const name = normalizeName(body.name)
    if (!name.ok) return name
    out.name = name.value
  }
  if (body.notes !== undefined) {
    const notes = normalizeNotes(body.notes)
    if (!notes.ok) return notes
    out.notes = notes.value
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { ok: false, message: 'Поле is_active має бути true/false' }
    out.is_active = body.is_active
  }
  if (Object.keys(out).length === 0) return { ok: false, message: REF_ERRORS.nothing }
  return { ok: true, value: out }
}

/** Заявки з посиланням: агрегація в памʼяті (select ≤ 10 000 рядків, як у звітах). */
export function aggregateLeadStats(
  rows: ReadonlyArray<{ referral_link_id: string; created_at: string }>,
  now: Date,
): ReferralLinkStats[] {
  const since30 = now.getTime() - 30 * 24 * 3600 * 1000
  const byLink = new Map<string, ReferralLinkStats>()
  for (const r of rows) {
    const cur = byLink.get(r.referral_link_id) ?? { link_id: r.referral_link_id, total: 0, last30: 0, last_at: null }
    cur.total += 1
    const t = new Date(r.created_at).getTime()
    if (t >= since30) cur.last30 += 1
    if (!cur.last_at || t > new Date(cur.last_at).getTime()) cur.last_at = r.created_at
    byLink.set(r.referral_link_id, cur)
  }
  return [...byLink.values()]
}
