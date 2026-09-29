// manage-referral-links на фейкових портах: генерація коду з однією повторною спробою, 409 за назвою/кодом,
// незмінний код, заборона видалення із заявками (підрахунок і FK 23503), статистика, аудит.
import { describe, it, expect, vi } from 'vitest'
import { makeReferralLinkUseCases } from '../manage-referral-links'
import { dbOk, dbFail } from '../../../ports/common'

const NOW = new Date('2026-09-27T10:00:00.000Z')
const actor = { id: 'u1', email: 'a@b.c' }
const link = (over: Record<string, unknown> = {}) => ({
  id: 'l1', name: 'Партнер', code: 'abcd2345', is_active: true, notes: null, created_by: 'u1',
  created_at: '2026-09-27T09:00:00.000Z', updated_at: '2026-09-27T09:00:00.000Z', ...over,
})

function setup(over: Record<string, unknown> = {}, leadsCount = 0) {
  const links = {
    list: vi.fn(async () => dbOk([link()])),
    listRefs: vi.fn(async () => dbOk([{ id: 'l1', name: 'Партнер', code: 'abcd2345', is_active: true }])),
    get: vi.fn(async (id: string) => dbOk(id === 'l1' ? link() : null)),
    findByCode: vi.fn(),
    insert: vi.fn(async (v: Record<string, unknown>) => dbOk(link({ ...v, id: 'l-new' }))),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => dbOk(link({ id, ...patch }))),
    delete: vi.fn(async () => dbOk(undefined)),
    leadRows: vi.fn(async () => dbOk({ rows: [{ referral_link_id: 'l1', created_at: '2026-09-26T10:00:00Z' }], truncated: false })),
    ...over,
  }
  const leads = { countByReferralLink: vi.fn(async () => leadsCount) }
  const audit = { record: vi.fn(async () => {}) }
  const settings = { get: vi.fn(async () => (over.windowValue as string | null | undefined) ?? null) }
  const updateSettings = vi.fn(async () => ({ ok: true as const, value: undefined }))
  let n = 0
  const uc = makeReferralLinkUseCases({ links, leads, settings, updateSettings, clock: { now: () => NOW }, randomInt: (max: number) => n++ % max, audit } as never)
  return { uc, links, leads, audit, settings, updateSettings }
}

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('createLink', () => {
  it('валідація → invalid; успіх → insert з випадковим кодом і created_by, аудит без нотаток', async () => {
    const { uc, links, audit } = setup()
    expect(await uc.createLink({ name: '' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    const r = await uc.createLink({ name: ' Агенція ', notes: 'x' }, actor)
    expect(r.ok).toBe(true)
    const values = links.insert.mock.calls[0][0] as Record<string, unknown>
    expect(values).toMatchObject({ name: 'Агенція', notes: 'x', created_by: 'u1' })
    expect(values.code).toMatch(/^[a-z0-9]{8}$/)
    expect(audit.record).toHaveBeenCalledWith(actor, 'referral_link.create', 'referral_links/l-new', { new: { name: 'Агенція', code: values.code } })
  })

  it('дубль назви (constraint name_lower) → conflict без повторної спроби', async () => {
    quiet()
    const { uc, links } = setup({ insert: vi.fn(async () => dbFail('duplicate key value violates unique constraint "referral_links_name_lower_key"', '23505')) })
    expect(await uc.createLink({ name: 'Партнер' }, actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Посилання з такою назвою вже існує' })
    expect(links.insert).toHaveBeenCalledTimes(1)
  })

  it('колізія випадкового коду → одна повторна спроба з іншим кодом; друга колізія → conflict', async () => {
    quiet()
    const insert = vi.fn()
      .mockResolvedValueOnce(dbFail('duplicate key value violates unique constraint "referral_links_code_key"', '23505'))
      .mockResolvedValueOnce(dbOk(link({ id: 'l2', code: 'zzzz9999' })))
    const { uc, links } = setup({ insert })
    const r = await uc.createLink({ name: 'X' }, actor)
    expect(r.ok).toBe(true)
    expect(links.insert).toHaveBeenCalledTimes(2)
    const c1 = (links.insert.mock.calls[0][0] as { code: string }).code
    const c2 = (links.insert.mock.calls[1][0] as { code: string }).code
    expect(c1).not.toBe(c2)
    const always = setup({ insert: vi.fn(async () => dbFail('… "referral_links_code_key"', '23505')) })
    expect(await always.uc.createLink({ name: 'Y' }, actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Посилання з таким кодом вже існує' })
    expect(always.links.insert).toHaveBeenCalledTimes(2)
  })

  it('інша помилка БД → failed', async () => {
    quiet()
    const { uc } = setup({ insert: vi.fn(async () => dbFail('boom')) })
    expect(await uc.createLink({ name: 'X' }, actor)).toMatchObject({ ok: false, code: 'failed' })
  })
})

describe('updateLink', () => {
  it('код у тілі → invalid; порожній патч → invalid; неіснуюче → not_found', async () => {
    const { uc } = setup()
    expect(await uc.updateLink('l1', { code: 'x' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.updateLink('l1', {}, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.updateLink('nope', { name: 'x' }, actor)).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('успіх → update з updated_at від Clock, аудит old/new; дубль назви → conflict', async () => {
    quiet()
    const { uc, links, audit } = setup()
    const r = await uc.updateLink('l1', { is_active: false, name: 'Нова' }, actor)
    expect(r.ok).toBe(true)
    expect(links.update).toHaveBeenCalledWith('l1', { is_active: false, name: 'Нова', updated_at: NOW.toISOString() })
    expect(audit.record).toHaveBeenCalledWith(actor, 'referral_link.update', 'referral_links/l1', {
      old: { name: 'Партнер', notes: null, is_active: true },
      new: { is_active: false, name: 'Нова' },
    })
    const dup = setup({ update: vi.fn(async () => dbFail('dup', '23505')) })
    expect(await dup.uc.updateLink('l1', { name: 'X' }, actor)).toMatchObject({ ok: false, code: 'conflict' })
  })
})

describe('deleteLink', () => {
  it('із заявками → conflict з кількістю; без заявок → delete + аудит; FK 23503 → conflict; not_found', async () => {
    quiet()
    const busy = setup({}, 3)
    expect(await busy.uc.deleteLink('l1', actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Посилання має 3 заявок — вимкніть його замість видалення' })
    expect(busy.links.delete).not.toHaveBeenCalled()

    const free = setup()
    expect(await free.uc.deleteLink('l1', actor)).toEqual({ ok: true, value: undefined })
    expect(free.audit.record).toHaveBeenCalledWith(actor, 'referral_link.delete', 'referral_links/l1', { old: { name: 'Партнер', code: 'abcd2345' } })

    const race = setup({ delete: vi.fn(async () => dbFail('fk', '23503')) })
    expect(await race.uc.deleteLink('l1', actor)).toMatchObject({ ok: false, code: 'conflict' })

    expect(await free.uc.deleteLink('nope', actor)).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('listLinks / listRefs / getStats', () => {
  it('повертають дані репозиторію; помилка → failed; статистика агрегується від Clock', async () => {
    quiet()
    const { uc } = setup()
    expect((await uc.listLinks()).ok).toBe(true)
    expect((await uc.listRefs()).ok).toBe(true)
    const s = await uc.getStats()
    expect(s.ok && s.value).toEqual({ stats: [{ link_id: 'l1', total: 1, last30: 1, last_at: '2026-09-26T10:00:00Z' }], truncated: false })
    const broken = setup({ list: vi.fn(async () => dbFail('x')), leadRows: vi.fn(async () => dbFail('y')) })
    expect(await broken.uc.listLinks()).toMatchObject({ ok: false, code: 'failed' })
    expect(await broken.uc.getStats()).toMatchObject({ ok: false, code: 'failed' })
  })
})

describe('вікно first-touch-атрибуції', () => {
  it('get: відсутнє/невалідне → дефолт 90 з пресетами й межами; збережене → значення', async () => {
    const { uc } = setup()
    expect(await uc.getAttributionWindow()).toEqual({ ok: true, value: { days: 90, defaultDays: 90, presets: [14, 30, 60, 90, 180, 365], min: 1, max: 400 } })
    expect((await setup({ windowValue: '30' }).uc.getAttributionWindow())).toMatchObject({ ok: true, value: { days: 30 } })
    expect((await setup({ windowValue: '999' }).uc.getAttributionWindow())).toMatchObject({ ok: true, value: { days: 90 } })
  })

  it('set: ціле 1–400 → сценарій налаштувань з ключем referral_attribution_days; поза межами → invalid без запису', async () => {
    const { uc, updateSettings } = setup()
    expect(await uc.setAttributionWindow({ days: 180 }, actor)).toMatchObject({ ok: true, value: { days: 180 } })
    expect(updateSettings).toHaveBeenCalledWith({ items: [{ key: 'referral_attribution_days', value: 180, type: 'number' }] }, actor)
    for (const days of [0, 401, 1.5, 'x', undefined]) {
      const r = await uc.setAttributionWindow({ days }, actor)
      expect(r).toMatchObject({ ok: false, code: 'invalid' })
    }
    expect(updateSettings).toHaveBeenCalledTimes(1)
  })
})
