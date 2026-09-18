// makeStageUseCases на фейкових портах — розділ 6: стадії воронки (створення, зміна, видалення,
// порядок, radio-поведінка is_initial).
import { describe, it, expect, vi } from 'vitest'
import { makeStageUseCases } from '../manage-stages'
import { dbOk, dbFail, UNIQUE_VIOLATION } from '../../../ports/common'
import { STAGE_ERRORS } from '../../../../domain/funnel/stage-rules'

const actor = { id: 'u1', email: 'a@b.c' }
const NO_ID = '00000000-0000-0000-0000-000000000000'

const CURRENT = {
  id: 'st-1',
  is_initial: false,
  conversion_type: null,
  conversion_action: null,
  requires_amount: false,
}

function setup(over: { statuses?: Record<string, unknown>; leads?: Record<string, unknown> } = {}) {
  const statuses = {
    list: vi.fn(async () => dbOk([])),
    getForTransition: vi.fn(),
    getCurrent: vi.fn(async () => ({ ...CURRENT })),
    getForDelete: vi.fn(async (id: string) => ({ id, name: 'Нова', is_initial: false })),
    findInitialId: vi.fn(),
    findIdByName: vi.fn(),
    clearInitialExcept: vi.fn(async () => {}),
    countInitialExcept: vi.fn(async () => 1),
    maxPosition: vi.fn(async () => 4),
    insert: vi.fn(async (values: Record<string, unknown>) => dbOk({ id: 'st-new', ...values })),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => dbOk({ id, ...patch })),
    delete: vi.fn(async () => dbOk(undefined)),
    setPosition: vi.fn(async () => dbOk(undefined)),
    ...over.statuses,
  }
  const leads = { countByStatus: vi.fn(async () => 0), ...over.leads }
  const settings = { get: vi.fn(async () => null) }
  const audit = { record: vi.fn(async () => {}) }
  const deps = { statuses, leads, settings, audit }
  return { uc: makeStageUseCases(deps as never), statuses, leads, settings, audit }
}

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('createStage', () => {
  it('помилки валідації → invalid з текстом із STAGE_ERRORS, БД не чіпаємо', async () => {
    const { uc, statuses } = setup()
    expect(await uc.createStage({ name: '  ' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.name })
    expect(await uc.createStage({ name: 'x'.repeat(65) }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.name })
    expect(await uc.createStage({ name: 'Нова', color: 'red' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.color })
    expect(await uc.createStage({ name: 'Нова', conversion_type: 'deal' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.conversionActionRequired })
    expect(await uc.createStage({ name: 'Нова', conversion_type: 'target_lead', conversion_action: 'Lead', requires_amount: true }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.requiresAmount })
    expect(await uc.createStage({ name: 'Нова', conversion_type: 'bogus' as never }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.conversionType })
    expect(statuses.maxPosition).not.toHaveBeenCalled()
    expect(statuses.insert).not.toHaveBeenCalled()
  })

  it('is_initial: true → clearInitialExcept(NO_ID) перед insert; позиція = max + 1; audit stage.create', async () => {
    const { uc, statuses, audit } = setup()
    const r = await uc.createStage({ name: ' Нова ', is_initial: true }, actor)
    expect(r.ok).toBe(true)
    expect(statuses.clearInitialExcept).toHaveBeenCalledWith(NO_ID)
    expect(statuses.clearInitialExcept.mock.invocationCallOrder[0]).toBeLessThan(statuses.insert.mock.invocationCallOrder[0])
    const values = {
      name: 'Нова',
      color: '#6b7280',
      is_final: false,
      is_initial: true,
      conversion_type: null,
      conversion_action: null,
      requires_amount: false,
      amount_is_profit: false,
    }
    expect(statuses.insert).toHaveBeenCalledWith({ ...values, position: 5 })
    expect(audit.record).toHaveBeenCalledWith(actor, 'stage.create', 'lead_statuses/st-new', { new: values })
  })

  it('без is_initial → clearInitialExcept не викликається; конверсійна стадія завжди is_final', async () => {
    const { uc, statuses } = setup()
    await uc.createStage({ name: 'Угода', conversion_type: 'deal', conversion_action: 'deal_offline', requires_amount: true, amount_is_profit: true }, actor)
    expect(statuses.clearInitialExcept).not.toHaveBeenCalled()
    expect(statuses.insert).toHaveBeenCalledWith(
      expect.objectContaining({ is_final: true, is_initial: false, requires_amount: true, amount_is_profit: true, conversion_action: 'deal_offline' }),
    )
  })

  it('unique_violation → conflict; інша помилка → failed; журнал не пишеться', async () => {
    quiet()
    const conflict = setup({ statuses: { insert: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) } })
    expect(await conflict.uc.createStage({ name: 'Нова' }, actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Стадія з такою назвою вже існує' })
    expect(conflict.audit.record).not.toHaveBeenCalled()
    const failed = setup({ statuses: { insert: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.createStage({ name: 'Нова' }, actor)).toMatchObject({ ok: false, code: 'failed', message: 'boom' })
  })
})

describe('updateStage', () => {
  it('стадію не знайдено → not_found', async () => {
    const { uc, statuses } = setup({ statuses: { getCurrent: vi.fn(async () => null) } })
    expect(await uc.updateStage('st-x', { name: 'X' }, actor)).toMatchObject({ ok: false, code: 'not_found' })
    expect(statuses.update).not.toHaveBeenCalled()
  })

  it('помилка валідації патчу → invalid', async () => {
    const { uc, statuses } = setup()
    expect(await uc.updateStage('st-1', { color: 'blue' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.color })
    expect(statuses.update).not.toHaveBeenCalled()
  })

  it('зняти is_initial з останньої початкової → invalid lastInitial', async () => {
    const { uc, statuses } = setup({
      statuses: { getCurrent: vi.fn(async () => ({ ...CURRENT, is_initial: true })), countInitialExcept: vi.fn(async () => 0) },
    })
    expect(await uc.updateStage('st-1', { is_initial: false }, actor)).toMatchObject({ ok: false, code: 'invalid', message: STAGE_ERRORS.lastInitial })
    expect(statuses.countInitialExcept).toHaveBeenCalledWith('st-1')
    expect(statuses.update).not.toHaveBeenCalled()
  })

  it('зняти is_initial, коли є інша початкова → update { is_initial: false }', async () => {
    const { uc, statuses } = setup({ statuses: { getCurrent: vi.fn(async () => ({ ...CURRENT, is_initial: true })) } })
    expect((await uc.updateStage('st-1', { is_initial: false }, actor)).ok).toBe(true)
    expect(statuses.update).toHaveBeenCalledWith('st-1', { is_initial: false })
    expect(statuses.clearInitialExcept).not.toHaveBeenCalled()
  })

  it('зняти is_initial зі стадії, що й так не початкова → лічильник не потрібен', async () => {
    const { uc, statuses } = setup()
    expect((await uc.updateStage('st-1', { is_initial: false }, actor)).ok).toBe(true)
    expect(statuses.countInitialExcept).not.toHaveBeenCalled()
    expect(statuses.update).toHaveBeenCalledWith('st-1', { is_initial: false })
  })

  it('is_initial: true — radio: clearInitialExcept(id) + update { is_initial: true }', async () => {
    const { uc, statuses } = setup()
    expect((await uc.updateStage('st-1', { is_initial: true }, actor)).ok).toBe(true)
    expect(statuses.clearInitialExcept).toHaveBeenCalledWith('st-1')
    expect(statuses.clearInitialExcept.mock.invocationCallOrder[0]).toBeLessThan(statuses.update.mock.invocationCallOrder[0])
    expect(statuses.update).toHaveBeenCalledWith('st-1', { is_initial: true })
  })

  it('порожній патч → «Нічого оновлювати»', async () => {
    const { uc, statuses } = setup()
    expect(await uc.updateStage('st-1', {}, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Нічого оновлювати' })
    expect(statuses.update).not.toHaveBeenCalled()
  })

  it('успіх → audit stage.update зі станом до (current) і патчем', async () => {
    const { uc, statuses, audit } = setup()
    const r = await uc.updateStage('st-1', { name: ' Кваліфікація ', color: '#112233' }, actor)
    expect(r.ok).toBe(true)
    const update = { name: 'Кваліфікація', color: '#112233' }
    expect(statuses.update).toHaveBeenCalledWith('st-1', update)
    expect(audit.record).toHaveBeenCalledWith(actor, 'stage.update', 'lead_statuses/st-1', { old: CURRENT, new: update })
  })

  it('помилка update → failed, без audit', async () => {
    quiet()
    const { uc, audit } = setup({ statuses: { update: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.updateStage('st-1', { name: 'X' }, actor)).toMatchObject({ ok: false, code: 'failed', message: 'boom' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('deleteStage', () => {
  it('не знайдено → not_found', async () => {
    const { uc, statuses } = setup({ statuses: { getForDelete: vi.fn(async () => null) } })
    expect(await uc.deleteStage('st-x', actor)).toMatchObject({ ok: false, code: 'not_found' })
    expect(statuses.delete).not.toHaveBeenCalled()
  })

  it('початкова стадія → invalid, ліди не рахуються', async () => {
    const { uc, statuses, leads } = setup({ statuses: { getForDelete: vi.fn(async () => ({ id: 'st-1', name: 'Нова', is_initial: true })) } })
    expect(await uc.deleteStage('st-1', actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Спочатку призначте іншу стадію первинною' })
    expect(leads.countByStatus).not.toHaveBeenCalled()
    expect(statuses.delete).not.toHaveBeenCalled()
  })

  it('на стадії є ліди → invalid, повідомлення містить кількість', async () => {
    const { uc, statuses } = setup({ leads: { countByStatus: vi.fn(async () => 7) } })
    const r = await uc.deleteStage('st-1', actor)
    expect(r).toMatchObject({ ok: false, code: 'invalid' })
    expect((r as { message: string }).message).toContain('7 лід(ів)')
    expect(statuses.delete).not.toHaveBeenCalled()
  })

  it('успіх → delete + audit stage.delete зі старим станом', async () => {
    const { uc, statuses, leads, audit } = setup()
    expect(await uc.deleteStage('st-1', actor)).toEqual({ ok: true, value: undefined })
    expect(leads.countByStatus).toHaveBeenCalledWith('st-1')
    expect(statuses.delete).toHaveBeenCalledWith('st-1')
    expect(audit.record).toHaveBeenCalledWith(actor, 'stage.delete', 'lead_statuses/st-1', { old: { id: 'st-1', name: 'Нова', is_initial: false } })
  })

  it('помилка delete → failed, без audit', async () => {
    quiet()
    const { uc, audit } = setup({ statuses: { delete: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.deleteStage('st-1', actor)).toMatchObject({ ok: false, code: 'failed' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('reorderStages', () => {
  it('items не масив або порожній → invalid «Порожній items»', async () => {
    const { uc, statuses } = setup()
    expect(await uc.reorderStages({}, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Порожній items' })
    expect(await uc.reorderStages({ items: 'x' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Порожній items' })
    expect(await uc.reorderStages({ items: [] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Порожній items' })
    expect(statuses.setPosition).not.toHaveBeenCalled()
  })

  it('невірний елемент (без id / NaN / відʼємна позиція) → invalid, жодного UPDATE', async () => {
    const { uc, statuses } = setup()
    expect(await uc.reorderStages({ items: [{ id: 'a', position: 0 }, { position: 1 }] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Невірні дані' })
    expect(await uc.reorderStages({ items: [{ id: 'a', position: 'x' }] }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.reorderStages({ items: [{ id: 'a', position: -1 }] }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(statuses.setPosition).not.toHaveBeenCalled()
  })

  it('послідовні setPosition з floor; audit stage.reorder з items як прислано', async () => {
    const { uc, statuses, audit } = setup()
    const items = [{ id: 'st-2', position: 0 }, { id: 'st-1', position: 1.7 }, { id: 'st-3', position: 2 }]
    expect(await uc.reorderStages({ items }, actor)).toEqual({ ok: true, value: undefined })
    expect(statuses.setPosition.mock.calls).toEqual([['st-2', 0], ['st-1', 1], ['st-3', 2]])
    expect(audit.record).toHaveBeenCalledWith(actor, 'stage.reorder', 'lead_statuses', { new: items })
  })

  it('частковий збій → failed з переліком помилок, решта UPDATE усе одно виконана, без audit', async () => {
    quiet()
    const { uc, statuses, audit } = setup({
      statuses: { setPosition: vi.fn(async (id: string) => (id === 'st-1' ? dbFail('locked') : dbOk(undefined))) },
    })
    const r = await uc.reorderStages({ items: [{ id: 'st-2', position: 0 }, { id: 'st-1', position: 1 }, { id: 'st-3', position: 2 }] }, actor)
    expect(r).toMatchObject({ ok: false, code: 'failed', message: 'st-1: locked' })
    expect(statuses.setPosition).toHaveBeenCalledTimes(3)
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('listStages', () => {
  it('віддає список і прапор pipelines_enabled із налаштувань', async () => {
    const { uc, settings } = setup()
    settings.get.mockResolvedValueOnce('true' as never)
    const r = await uc.listStages()
    expect(r).toEqual({ ok: true, value: { data: [], pipelines_enabled: true } })
    expect(settings.get).toHaveBeenCalledWith('pipelines_enabled')
  })

  it('помилка читання → failed', async () => {
    quiet()
    const { uc } = setup({ statuses: { list: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.listStages()).toMatchObject({ ok: false, code: 'failed' })
  })
})
