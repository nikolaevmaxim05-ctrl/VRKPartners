// core/domain/lead/patch — тело PATCH лида (стадия, ответственный, суммы).
import { z } from 'zod'

// C8: суммы — конечные неотрицательные числа (или null), id — строки (или null).
// Неизвестные ключи Zod отбрасывает (защита от mass-assignment).
export const patchLeadSchema = z
  .object({
    status_id: z.string().min(1).nullable(),
    assigned_to: z.string().min(1).nullable(),
    deal_amount: z.number().finite().nonnegative().nullable(),
    deal_profit: z.number().finite().nonnegative().nullable(),
  })
  .partial()

export const PATCHABLE_LEAD_KEYS = ['status_id', 'assigned_to', 'deal_amount', 'deal_profit'] as const

/**
 * Строит update только из ключей, реально присутствующих в сыром теле (семантика «обновляем только
 * переданные»). null → ошибка валидации; {} → «нечего обновлять».
 */
export function parseLeadPatch(raw: unknown):
  | { ok: true; update: Record<string, unknown>; bodyKeys: Set<string> }
  | { ok: false; message: string } {
  const parsed = patchLeadSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'Невірні дані' }
  const bodyObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const body = parsed.data
  const update: Record<string, unknown> = {}
  for (const k of PATCHABLE_LEAD_KEYS) {
    if (k in bodyObj) update[k] = body[k] ?? null
  }
  if (Object.keys(update).length === 0) return { ok: false, message: 'Нічого оновлювати' }
  return { ok: true, update, bodyKeys: new Set(Object.keys(bodyObj)) }
}
