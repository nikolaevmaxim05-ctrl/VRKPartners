// core/domain/lead/patch — тіло PATCH ліда (стадія, відповідальний, суми).
import { z } from 'zod'

// C8: суми — скінченні невідʼємні числа (або null), id — рядки (або null).
// Невідомі ключі Zod відкидає (захист від mass-assignment).
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
 * Будує update лише з ключів, реально присутніх у сирому тілі (семантика «оновлюємо лише
 * передані»). null → помилка валідації; {} → «нічого оновлювати».
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
