// submit-lead на фейковых портах — порядок раздела 8: Zod → honeypot → rate limit (по leads) →
// нормализация → дедуп → запись → уведомления (allSettled).
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

type RefOpt = { id: string; name: string; is_active: boolean } | null | 'error' | 'throw'

function setup(opts: { count?: number | 'error'; notifyOk?: boolean; saveOk?: boolean; bypass?: boolean; referral?: RefOpt; windowDays?: string | 'error' } = {}) {
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
    settings: {
      getMany: vi.fn(async (keys: string[]) => {
        if (keys.includes('referral_attribution_days') && opts.windowDays === 'error') return dbFail<Map<string, string | null>>('db down')
        return dbOk(new Map<string, string | null>(opts.windowDays && opts.windowDays !== 'error' ? [['referral_attribution_days', opts.windowDays]] : []))
      }),
    },
    notifiers,
    clock: { now: () => NOW },
    rateLimitBypass: () => opts.bypass ?? false,
    referrals: {
      findByCode: vi.fn(async () => {
        if (opts.referral === 'error') return dbFail('db down')
        if (opts.referral === 'throw') throw new Error('boom')
        return dbOk(opts.referral ?? null)
      }),
    },
  }
  return { submit: makeSubmitLead(deps as never), deps, leads, notifiers, referrals: deps.referrals }
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
        referral_link_id: null,
        referral_code: null,
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

describe('submit-lead — реферал (відхилення 11)', () => {
  const ACTIVE = { id: 'link-1', name: 'Агенція', is_active: true }

  it('4. легасі-джерела (голий код у cookie/ref/?ref — касання «зараз»): порядок cookie → тіло → сторінка; активне → id + код, «Партнер» у сповіщенні', async () => {
    quiet()
    const { submit, leads, referrals, notifiers } = setup({ referral: ACTIVE })
    await submit({ ...valid, ref: 'bodycode', page: 'https://vrk.com.ua/?ref=pagecode' }, { ...ctx, referralCookie: 'COOKIE12' })
    expect(referrals.findByCode).toHaveBeenCalledWith('cookie12')
    expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: 'link-1', referral_code: 'cookie12' }))
    expect(notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ referral: { code: 'cookie12', name: 'Агенція', state: 'active', touchedAt: NOW.toISOString() } }))

    const noCookie = setup({ referral: ACTIVE })
    await noCookie.submit({ ...valid, ref: 'bodycode', page: 'https://vrk.com.ua/?ref=pagecode' }, ctx)
    expect(noCookie.referrals.findByCode).toHaveBeenCalledWith('bodycode')
    const pageOnly = setup({ referral: ACTIVE })
    await pageOnly.submit({ ...valid, page: 'https://vrk.com.ua/?ref=pagecode' }, ctx)
    expect(pageOnly.referrals.findByCode).toHaveBeenCalledWith('pagecode')
  })

  it('4. невідомий код → id null, код збережено; вимкнене посилання → id null, код і назва в сповіщенні', async () => {
    quiet()
    const unknown = setup({ referral: null })
    await unknown.submit({ ...valid, ref: 'nope1234' }, ctx)
    expect(unknown.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: null, referral_code: 'nope1234' }))
    expect(unknown.notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ referral: { code: 'nope1234', name: null, state: 'unknown', touchedAt: NOW.toISOString() } }))
    const inactive = setup({ referral: { id: 'link-2', name: 'Старий', is_active: false } })
    await inactive.submit({ ...valid, ref: 'old12345' }, ctx)
    expect(inactive.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: null, referral_code: 'old12345' }))
    expect(inactive.notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ referral: { code: 'old12345', name: 'Старий', state: 'inactive', touchedAt: NOW.toISOString() } }))
  })

  it('4. помилка або виняток пошуку → лід записаний без привʼязки, відповідь ok', async () => {
    quiet()
    for (const referral of ['error', 'throw'] as const) {
      const { submit, leads } = setup({ referral })
      expect(await submit({ ...valid, ref: 'abcd1234' }, ctx)).toEqual({ ok: true, value: { duplicate: false } })
      expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: null, referral_code: 'abcd1234' }))
    }
  })

  it('4. без коду → findByCode не викликається; honeypot і ліміт → теж ні; дубль → пошук є, «Партнер» у коментарі [ПОВТОР]', async () => {
    quiet()
    const plain = setup({ referral: ACTIVE })
    await plain.submit(valid, ctx)
    expect(plain.referrals.findByCode).not.toHaveBeenCalled()
    const bot = setup({ referral: ACTIVE })
    await bot.submit({ ...valid, ref: 'abcd1234', company: 'bot' }, ctx)
    expect(bot.referrals.findByCode).not.toHaveBeenCalled()
    const limited = setup({ referral: ACTIVE, count: LEAD_RATE_LIMIT.max })
    await limited.submit({ ...valid, ref: 'abcd1234' }, ctx)
    expect(limited.referrals.findByCode).not.toHaveBeenCalled()
    const dup = setup({ referral: ACTIVE })
    const r = await dup.submit({ ...valid, phone: STORED_PHONE, ref: 'abcd1234' }, ctx)
    expect(r).toEqual({ ok: true, value: { duplicate: true } })
    expect(dup.referrals.findByCode).toHaveBeenCalledWith('abcd1234')
    const comment = (dup.deps.comments.insertMany.mock.calls[0] as unknown as [{ content: string }[]])[0][0].content
    expect(comment).toContain('Партнер: Агенція')
    expect(dup.leads.insert).not.toHaveBeenCalled()
  })

  const SEC = Math.floor(NOW.getTime() / 1000)
  const DAY = 86_400
  const iso = (sec: number) => new Date(sec * 1000).toISOString()
  const cookie = (...pairs: Array<[string, number]>) => 'v2_' + pairs.map(([c, at]) => c + '.' + at).join('_')

  it('first-touch: найраніше касання cookie виграє пізніше; referral_touched_at = момент першого переходу; дата у сповіщенні', async () => {
    quiet()
    const { submit, leads, referrals, notifiers } = setup({ referral: ACTIVE })
    await submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 5 * DAY], ['bbbb2345', SEC - DAY]) })
    expect(referrals.findByCode).toHaveBeenCalledWith('aaaa2345')
    expect(referrals.findByCode).toHaveBeenCalledTimes(1)
    expect(leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: 'link-1', referral_code: 'aaaa2345', referral_touched_at: iso(SEC - 5 * DAY) }))
    expect(notifiers.telegram.send).toHaveBeenCalledWith(expect.objectContaining({ referral: { code: 'aaaa2345', name: 'Агенція', state: 'active', touchedAt: iso(SEC - 5 * DAY) } }))
  })

  it('first-touch: перше касання поза вікном (90) → друге; усі поза вікном → органічна заявка без коду і без пошуку', async () => {
    quiet()
    const second = setup({ referral: ACTIVE })
    await second.submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 200 * DAY], ['bbbb2345', SEC - DAY]) })
    expect(second.referrals.findByCode).toHaveBeenCalledWith('bbbb2345')
    expect(second.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_code: 'bbbb2345', referral_touched_at: iso(SEC - DAY) }))
    const none = setup({ referral: ACTIVE })
    await none.submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 200 * DAY], ['bbbb2345', SEC - 100 * DAY]) })
    expect(none.referrals.findByCode).not.toHaveBeenCalled()
    expect(none.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: null, referral_code: null, referral_touched_at: null }))
    const sent = (none.notifiers.telegram.send.mock.calls as unknown as [[{ referral?: unknown }]])[0][0]
    expect(sent.referral).toBeUndefined()
  })

  it('first-touch: вікно з налаштування (14 днів) звужує вибір; помилка читання/мусор → дефолт 90', async () => {
    quiet()
    const narrow = setup({ referral: ACTIVE, windowDays: '14' })
    await narrow.submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 20 * DAY], ['bbbb2345', SEC - 3 * DAY]) })
    expect(narrow.referrals.findByCode).toHaveBeenCalledWith('bbbb2345')
    for (const windowDays of ['error', 'abc'] as const) {
      const wide = setup({ referral: ACTIVE, windowDays })
      await wide.submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 20 * DAY], ['bbbb2345', SEC - 3 * DAY]) })
      expect(wide.referrals.findByCode).toHaveBeenCalledWith('aaaa2345')
    }
  })

  it('first-touch: вимкнене перше посилання → лише код (друге не розглядається); cookie ⊕ тіло ⊕ сторінка — мінімальний ts за кодом', async () => {
    quiet()
    const inactiveFirst = setup({ referral: { id: 'link-2', name: 'Старий', is_active: false } })
    await inactiveFirst.submit(valid, { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 5 * DAY], ['bbbb2345', SEC - DAY]) })
    expect(inactiveFirst.referrals.findByCode).toHaveBeenCalledTimes(1)
    expect(inactiveFirst.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_link_id: null, referral_code: 'aaaa2345' }))
    const merged = setup({ referral: ACTIVE })
    await merged.submit(
      { ...valid, refTouches: [{ code: 'bbbb2345', at: SEC - 30 * DAY }, { code: 'zzzz9999', at: SEC - 2 * DAY }], page: 'https://vrk.com.ua/?ref=cccc2345' },
      { ...ctx, referralCookie: cookie(['aaaa2345', SEC - 5 * DAY], ['bbbb2345', SEC - DAY]) },
    )
    expect(merged.referrals.findByCode).toHaveBeenCalledWith('bbbb2345')
    expect(merged.leads.insert).toHaveBeenCalledWith(expect.objectContaining({ referral_code: 'bbbb2345', referral_touched_at: iso(SEC - 30 * DAY) }))
  })
})
