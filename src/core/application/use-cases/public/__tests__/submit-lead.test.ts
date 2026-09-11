// submit-lead на фейкових портах — порядок розділу 8: Zod → honeypot → rate limit (по leads) →
// нормалізація → дедуп → запис → сповіщення (allSettled).
import { describe, it, expect, vi } from 'vitest'
import { makeSubmitLead, LEAD_RATE_LIMIT } from '../submit-lead'
import { dbOk, dbFail } from '../../../ports/common'
import { makeLeadSchema } from '../../../../domain/lead/schema'

const STORED_PHONE = '+380991234567'
const NOW = new Date('2026-03-01T12:00:00.000Z')

const T = {
  errorNameMin: 'min',
  errorNameMax: 'max',
  errorNameLetters: 'letters',
  errorPhoneRequired: 'phone',
  errorPhoneIncomplete: 'incomplete',
  errorEmailInvalid: 'email',
}

function setup(opts: { count?: number | 'error'; notifyOk?: boolean; saveOk?: boolean; bypass?: boolean } = {}) {
  const leads = {
    findFirstIdByPhone: vi.fn(async (phone: string) => dbOk(phone === STORED_PHONE ? 'orig-1' : null)),
    findFirstIdByIpSince: vi.fn(async () => dbOk(null)),
    countByIpSince: vi.fn(async () => (opts.count === 'error' ? dbFail<number>('db down') : dbOk(opts.count ?? 0))),
    markRepeat: vi.fn(async () => dbOk(undefined)),
    insert: vi.fn(async () => (opts.saveOk === false ? dbFail<void>('db down') : dbOk(undefined))),
  }
  const notifier = () => ({ send: vi.fn(async () => ({ ok: opts.notifyOk ?? true })) })
  const notifiers = { telegram: notifier(), keycrm: notifier(), email: notifier() }
  const deps = {
    schema: makeLeadSchema(T),
    integrationConfig: { get: vi.fn(), prefetch: vi.fn(async () => {}) },
    leads,
    statuses: { findInitialId: vi.fn(async () => 'st-initial'), findIdByName: vi.fn(async () => null) },
    comments: { insertMany: vi.fn(async () => dbOk(undefined)) },
    settings: { getMany: vi.fn(async () => dbOk(new Map<string, string | null>())) },
    notifiers,
    clock: { now: () => NOW },
    rateLimitBypass: () => opts.bypass ?? false,
  }
  return { submit: makeSubmitLead(deps as never), deps, leads, notifiers }
}

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const ctx = { ip: '1.2.3.4', userAgent: 'UA' }
const valid = { name: 'Тест Тест', phone: '+380 (50) 123-45-67' }

describe('submit-lead', () => {
  it('1. невалідні дані → invalid «Invalid data» (до honeypot і ліміту)', async () => {
    const { submit, leads } = setup()
    expect(await submit({ name: 'A', phone: '1', company: 'spam' }, ctx)).toMatchObject({ ok: false, code: 'invalid', message: 'Invalid data' })
    expect(leads.countByIpSince).not.toHaveBeenCalled()
  })

  it('2. honeypot `company` → фейковий успіх без запису, ліміту і сповіщень', async () => {
    const { submit, leads, notifiers } = setup()
    const r = await submit({ ...valid, company: 'Spam Inc' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.insert).not.toHaveBeenCalled()
    expect(leads.countByIpSince).not.toHaveBeenCalled()
    expect(notifiers.telegram.send).not.toHaveBeenCalled()
  })

  it('3. ≥3 заявок з IP за 10 хв → rate_limited «Too many requests», retryAfter = вікно', async () => {
    quiet()
    const { submit, leads } = setup({ count: LEAD_RATE_LIMIT.max })
    const r = await submit(valid, ctx)
    expect(r).toMatchObject({ ok: false, code: 'rate_limited', message: 'Too many requests', details: { retryAfter: 600 } })
    expect(leads.countByIpSince).toHaveBeenCalledWith('1.2.3.4', new Date(NOW.getTime() - LEAD_RATE_LIMIT.windowMs).toISOString())
    expect(leads.insert).not.toHaveBeenCalled()
  })

  it('3. 2 заявки — ще можна', async () => {
    quiet()
    const { submit } = setup({ count: 2 })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
  })

  it('3. помилка підрахунку ліміту НЕ блокує заявку', async () => {
    quiet()
    const { submit, leads } = setup({ count: 'error' })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.insert).toHaveBeenCalledOnce()
  })

  it('3. байпас поза production (RATE_LIMIT_DISABLED) → підрахунок не викликається', async () => {
    quiet()
    const { submit, leads } = setup({ bypass: true, count: 10 })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.countByIpSince).not.toHaveBeenCalled()
  })

  it("3. IP 'unknown' → ліміт і дедуп за IP пропускаються, у БД ip_address = null", async () => {
    quiet()
    const { submit, leads } = setup()
    await submit(valid, { ip: 'unknown', userAgent: null })
    expect(leads.countByIpSince).not.toHaveBeenCalled()
    expect(leads.findFirstIdByIpSince).not.toHaveBeenCalled()
    expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ ip_address: null }))
  })

  it('5. нормалізація: телефон → E.164, email → trim+lowercase (крапки gmail у БД лишаються)', async () => {
    quiet()
    const { submit, leads, notifiers } = setup()
    await submit({ ...valid, email: '  Ivan.Petrenko@Gmail.com ' }, ctx)
    expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ phone: '+380501234567', email: 'ivan.petrenko@gmail.com' }))
    expect(notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ email: 'ivan.petrenko@gmail.com' }))
  })

  it('6. дубль за телефоном → маркування, system-коментар, Telegram [ПОВТОР], новий лід не створюється', async () => {
    quiet()
    const { submit, leads, notifiers, deps } = setup()
    const r = await submit({ name: 'Тест Тест', phone: '+380 (99) 123-45-67' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: true } })
    expect(leads.findFirstIdByPhone).toHaveBeenCalledWith(STORED_PHONE)
    expect(leads.markRepeat).toHaveBeenCalledWith('orig-1')
    expect(deps.comments.insertMany).toHaveBeenCalledOnce()
    expect(leads.insert).not.toHaveBeenCalled()
    expect(notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ phone: STORED_PHONE }), { isRepeat: true })
    expect(notifiers.keycrm.send).not.toHaveBeenCalled()
  })

  it('7. запис у початкову стадію ДО сповіщень, з locale і мітками', async () => {
    quiet()
    const order: string[] = []
    const { submit, leads, notifiers } = setup()
    leads.insert.mockImplementation(async () => {
      order.push('insert')
      return dbOk(undefined)
    })
    notifiers.telegram.send.mockImplementation(async () => {
      order.push('telegram')
      return { ok: true }
    })
    const r = await submit({ ...valid, page: 'https://vrk.com.ua/', source: 'hero', locale: 'uk', utm: { gclid: 'g1' } }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: false } })
    expect(order).toEqual(['insert', 'telegram'])
    expect(leads.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+380501234567',
        status_id: 'st-initial',
        ip_address: '1.2.3.4',
        source_url: 'https://vrk.com.ua/',
        locale: 'uk',
        gclid: 'g1',
        message: 'Форма: hero',
      }),
    )
    expect(notifiers.keycrm.send).toHaveBeenCalledOnce()
    expect(notifiers.email.send).toHaveBeenCalledOnce()
  })

  it('7. без locale у тілі → DEFAULT uk', async () => {
    quiet()
    const { submit, leads } = setup()
    await submit(valid, ctx)
    expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ locale: 'uk' }))
  })

  it('7. помилка БД → сповіщення все одно йдуть; ok, якщо хоч один канал доставив (рішення власника)', async () => {
    quiet()
    const { submit, notifiers } = setup({ saveOk: false })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
    expect(notifiers.telegram.send).toHaveBeenCalledOnce()
  })

  it('7. впали і БД, і всі канали → failed «DB error»', async () => {
    quiet()
    const { submit } = setup({ saveOk: false, notifyOk: false })
    expect(await submit(valid, ctx)).toMatchObject({ ok: false, code: 'failed', message: 'DB error' })
  })

  it('7. адаптер БД кинув виняток → без тіла 500 не буває: сповіщення йдуть, відповідь ok', async () => {
    quiet()
    const { submit, leads, notifiers } = setup()
    leads.insert.mockImplementation(async () => {
      throw new Error('supabaseUrl is required')
    })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
    expect(notifiers.telegram.send).toHaveBeenCalledOnce()
  })

  it('8. усі канали сповіщень впали → заявка все одно успішна (лід збережено)', async () => {
    quiet()
    const { submit, leads } = setup({ notifyOk: false })
    expect(await submit(valid, ctx)).toEqual({ ok: true, value: { duplicate: false } })
    expect(leads.insert).toHaveBeenCalledOnce()
  })
})
