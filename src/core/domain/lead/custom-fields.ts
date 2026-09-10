// core/domain/lead/custom-fields — правила кастомних полів ліда та їх значень (раздел 5).
// Перенесено з /api/admin/custom-fields* та /leads/[id]/custom-fields без зміни поведінки.

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
export type CustomFieldTypeName = (typeof CUSTOM_FIELD_TYPES)[number]

const KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

function cleanOptions(raw: unknown[]): string[] {
  return raw.map((o) => String(o).trim()).filter((o) => o.length > 0 && o.length <= 64)
}

export function planNewCustomField(body: {
  name?: string
  field_key?: string
  type?: string
  options?: string[]
  required?: boolean
}): Plan<{ name: string; field_key: string; type: CustomFieldTypeName; options: string[] | null; required: boolean }> {
  const name = (body.name ?? '').trim()
  const field_key = (body.field_key ?? '').trim().toLowerCase()
  const type = (body.type ?? 'text') as CustomFieldTypeName

  if (!name || name.length > 64) return { ok: false, message: 'Назва: 1-64 символи' }
  if (!KEY_REGEX.test(field_key)) {
    return { ok: false, message: 'Ключ: латиниця, цифри, _, починається з літери (макс. 64)' }
  }
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(type)) return { ok: false, message: 'Невірний тип' }

  let options: string[] | null = null
  if (type === 'select') {
    if (!Array.isArray(body.options) || body.options.length === 0) {
      return { ok: false, message: 'Для типу select потрібен список опцій' }
    }
    options = cleanOptions(body.options)
    if (options.length === 0) return { ok: false, message: 'Потрібна хоча б одна опція' }
  }

  return { ok: true, value: { name, field_key, type, options, required: !!body.required } }
}

export function planCustomFieldPatch(
  body: Partial<{ name: string; options: string[]; required: boolean; position: number }>,
  currentType: string,
): Plan<Record<string, unknown>> {
  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed || trimmed.length > 64) return { ok: false, message: 'Назва: 1-64 символи' }
    update.name = trimmed
  }
  if (body.options !== undefined) {
    if (currentType !== 'select') return { ok: false, message: 'Опції лише для типу select' }
    if (!Array.isArray(body.options) || body.options.length === 0) {
      return { ok: false, message: 'Потрібен непорожній список опцій' }
    }
    const opts = cleanOptions(body.options)
    if (opts.length === 0) return { ok: false, message: 'Потрібна хоча б одна опція' }
    update.options = opts
  }
  if (body.required !== undefined) update.required = !!body.required
  if (body.position !== undefined) {
    const p = Number(body.position)
    if (!Number.isFinite(p) || p < 0) return { ok: false, message: 'Невірна позиція' }
    update.position = Math.floor(p)
  }

  if (Object.keys(update).length === 0) return { ok: false, message: 'Нічого оновлювати' }
  return { ok: true, value: update }
}

/**
 * Нормалізація і валідація значення поля: '' → null; довжина ≤ 1000; number — скінченне;
 * date — YYYY-MM-DD і справжня дата; select — лише з опцій.
 */
export function validateCustomFieldValue(
  field: { type: string; options: unknown },
  raw: unknown,
): Plan<string | null> {
  let value: string | null = null
  if (raw !== null && raw !== undefined) {
    const s = String(raw).trim()
    value = s === '' ? null : s
  }
  if (value === null) return { ok: true, value }

  if (value.length > 1000) return { ok: false, message: 'Занадто довге значення' }
  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    return { ok: false, message: 'Невірне число' }
  }
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) {
    return { ok: false, message: 'Невірна дата (YYYY-MM-DD)' }
  }
  if (field.type === 'select') {
    const opts = Array.isArray(field.options) ? field.options : []
    if (!opts.includes(value)) return { ok: false, message: 'Значення не входить в список опцій' }
  }
  return { ok: true, value }
}
