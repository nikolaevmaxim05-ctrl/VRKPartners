// submit-lead на фейкових портах: honeypot, Zod, rate limit, дедуп (C1 — E.164), канали доставки.
import { describe, it, expect, vi } from 'vitest'
import { makeSubmitLead } from '../submit-lead'
import { dbOk } from '../../../ports/common'
import type { RateLimitResult } from '../../../ports/system'

const STORED_PHONE = '+380991234567'
const NOW = new Date('2026-03-01T12:00:00.000Z')

function setup(opts: { rl?: RateLimitResult; notifyOk?: boolean; saveOk?: boolean } = {}) {
  const leads = {
    findFirstIdByPhone: vi.fn(async (phone: string) => dbOk(phone === STORED_PHONE ? 'orig-1' : null)),
    findFirstIdByIpSince: vi.fn(async () => dbOk(null)),
    markRepeat: vi.fn(async () => dbOk(undefined)),
    insert: vi.fn(async () => (opts.saveOk === false ? { ok: false as const, error: 'db down' } : dbOk(undefined))),
  }
  const notifier = () => ({ send: vi.fn(async () => ({ ok: opts.notifyOk ?? true })) })
  const notifiers = { telegram: notifier(), keycrm: notifier(), email: notifier() }
  const deps = {
    rateLimiter: { check: vi.fn(async () => opts.rl ?? ({ status: 'ok', remaining: 4, reset: 0 } as RateLimitResult)) },
    integrationConfig: { get: vi.fn(), prefetch: vi.fn(async () => {}) },
    leads,
    statuses: { findInitialId: vi.fn(async () => 'st-initial'), findIdByName: vi.fn(async () => null) },
    comments: { insertMany: vi.fn(async () => dbOk(undefined)) },
    settings: { getMany: vi.fn(async () => dbOk(new Map<string, string | null>())) },
    notifiers,
    clock: { now: () => NOW },
  }
  return { submit: makeSubmitLead(deps as never), deps, leads, notifiers }
}

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const ctx = { ip: '1.2.3.4', userAgent: 'UA' }

describe('submit-lead', () => {
  it('honeypot `company` → тихий успіх без запису', async () => {
    const { submit, leads } = setup()
    const r = await submit({ name: 'Бот', phone: '+380 (99) 000-00-00', company: 'spam' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.insert).not.toHaveBeenCalled()
  })

  it('невалідні дані → invalid «Невірні дані»', async () => {
    const { submit } = setup()
    expect(await submit({ name: 'A', phone: '1' }, ctx)).toMatchObject({ ok: false, code: 'invalid', message: 'Невірні дані' })
  })

  it('перебір ліміту → rate_limited з retryAfter', async () => {
    quiet()
    const { submit } = setup({ rl: { status: 'limited', remaining: 0, reset: NOW.getTime() + 90_000 } })
    const r = await submit({ name: 'Тест Тест', phone: '+380 (50) 123-45-67' }, ctx)
    expect(r).toMatchObject({ ok: false, code: 'rate_limited', details: { retryAfter: 90 } })
  })

  it('rate-limiter недоступний → unavailable', async () => {
    quiet()
    const { submit } = setup({ rl: { status: 'unavailable', reason: 'db_error' } })
    expect(await submit({ name: 'Тест Тест', phone: '+380 (50) 123-45-67' }, ctx)).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('C1: маска телефону нормалізується в E.164 → дубль, новий лід не створюється', async () => {
    quiet()
    const { submit, leads, notifiers } = setup()
    const r = await submit({ name: 'Тест Тест', phone: '+380 (99) 123-45-67' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: true } })
    expect(leads.findFirstIdByPhone).toHaveBeenCalledWith(STORED_PHONE)
    expect(leads.markRepeat).toHaveBeenCalledWith('orig-1')
    expect(leads.insert).not.toHaveBeenCalled()
    expect(notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ phone: STORED_PHONE }), { isRepeat: true })
  })

  it('новий лід → запис у початкову стадію + 3 канали', async () => {
    quiet()
    const { submit, leads, notifiers } = setup()
    const r = await submit({ name: 'Тест Тест', phone: '+380 (50) 123-45-67', page: 'https://vrk.com.ua/' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.insert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+380501234567', status_id: 'st-initial', ip_address: '1.2.3.4', source_url: 'https://vrk.com.ua/' }),
    )
    expect(notifiers.keycrm.send).toHaveBeenCalledOnce()
    expect(notifiers.email.send).toHaveBeenCalledOnce()
  })

  it('усі канали впали (і БД) → failed', async () => {
    quiet()
    const { submit } = setup({ notifyOk: false, saveOk: false })
    expect(await submit({ name: 'Тест Тест', phone: '+380 (50) 123-45-67' }, ctx)).toMatchObject({ ok: false, code: 'failed' })
  })

  it('IP невідомий → rate limit пропускається', async () => {
    quiet()
    const { submit, deps } = setup()
    await submit({ name: 'Тест Тест', phone: '+380 (50) 123-45-67' }, { ip: null, userAgent: null })
    expect(deps.rateLimiter.check).not.toHaveBeenCalled()
  })
})
