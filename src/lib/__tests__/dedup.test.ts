// Регрес C1: дедуп по телефону мав бути мертвим (у БД маска, дедуп шукав E.164).
// Тепер Zod нормалізує телефон в E.164 → формати збігаються. Тут перевіряємо,
// що (1) транзформ дає E.164 і (2) повторний сабмит того самого номера — дубль.
import { describe, it, expect, vi } from 'vitest'

const STORED_PHONE = '+380991234567'

// Легкий мок серверного supabase-клієнта: site_settings → дефолти дедупу,
// leads → «збіг» лише коли шукають рівно STORED_PHONE.
type Builder = {
  select: () => Builder
  eq: (col: string, val: unknown) => Builder
  gte: () => Builder
  order: () => Builder
  limit: () => Builder
  in: () => Builder
  then: (onF: (v: unknown) => unknown) => Promise<unknown>
}

vi.mock('@/lib/supabase/service', () => {
  const makeBuilder = (resolver: (state: Record<string, unknown>) => unknown): Builder => {
    const state: Record<string, unknown> = {}
    const b: Builder = {
      select: () => b,
      eq: (col, val) => {
        state[col] = val
        return b
      },
      gte: () => b,
      order: () => b,
      limit: () => b,
      in: () => b,
      then: (onF) => Promise.resolve(resolver(state)).then(onF),
    }
    return b
  }
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        if (table === 'leads') {
          return makeBuilder((state) => ({
            data: state.phone === STORED_PHONE ? [{ id: 'orig-1' }] : [],
            error: null,
          }))
        }
        // site_settings та інші — порожньо (дедуп бере дефолти: phone+ip увімкнені)
        return makeBuilder(() => ({ data: [], error: null }))
      },
    }),
  }
})

import { deduplicateLead } from '@/lib/dedup'
import { leadSchema } from '@/lib/validators'

describe('C1 — дедуп по телефону', () => {
  it('Zod нормалізує маску +380 (XX) ... у E.164', () => {
    const parsed = leadSchema.parse({ name: 'Тест Тест', phone: '+380 (99) 123-45-67' })
    expect(parsed.phone).toBe(STORED_PHONE)
  })

  it('повторний сабмит того самого номера → дубль (reason=phone)', async () => {
    const res = await deduplicateLead({ phone: STORED_PHONE, ip: null })
    expect(res.isDuplicate).toBe(true)
    if (res.isDuplicate) expect(res.reason).toBe('phone')
  })

  it('маска на вході дедупу теж збігається (нормалізується перед пошуком)', async () => {
    const res = await deduplicateLead({ phone: '+380 (99) 123-45-67', ip: null })
    expect(res.isDuplicate).toBe(true)
  })

  it('інший номер → не дубль', async () => {
    const res = await deduplicateLead({ phone: '+380990000000', ip: null })
    expect(res.isDuplicate).toBe(false)
  })
})
