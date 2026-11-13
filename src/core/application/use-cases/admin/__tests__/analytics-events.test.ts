// makeAnalyticsEventsUseCases на фейковых портах: конфиг событий аналитики (site_settings.analytics_events).
// Реестр и дефолтные имена не меняются — тесты только читают их.
import { describe, it, expect, vi } from 'vitest'
import { makeAnalyticsEventsUseCases } from '../analytics-events'
import { dbOk, dbFail } from '../../../ports/common'
import { ANALYTICS_REGISTRY, ANALYTICS_EVENTS_SETTING_KEY, getDefaultAnalyticsEvents } from '../../../../domain/analytics/registry'

const actor = { id: 'u1', email: 'a@b.c' }
const NOW = new Date('2026-05-01T08:00:00.000Z')
const KEY = 'header_cta_click'
const OTHER = 'header_phone_click'

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

function setup(stored: string | null = null, over: Record<string, unknown> = {}) {
  const settings = {
    get: vi.fn(async (k: string) => (k === ANALYTICS_EVENTS_SETTING_KEY ? stored : null)),
    getMany: vi.fn(),
    listAll: vi.fn(),
    upsertMany: vi.fn(async () => dbOk(undefined)),
    ...over,
  }
  const cache = { invalidateSite: vi.fn(), invalidatePaths: vi.fn() }
  const audit = { record: vi.fn(async () => {}) }
  const deps = { settings, cache, clock: { now: () => NOW }, audit }
  return { uc: makeAnalyticsEventsUseCases(deps as never), settings, cache, audit }
}

describe('getEvents', () => {
  it('без збереженого конфігу → реєстр + дефолти (усе ввімкнено)', async () => {
    const { uc, settings } = setup(null)
    const r = await uc.getEvents()
    expect(r.registry).toBe(ANALYTICS_REGISTRY)
    expect(r.events).toEqual(getDefaultAnalyticsEvents())
    expect(r.events[KEY]).toEqual({ enabled: true, eventNames: ['cta_click'], eventName: 'cta_click' })
    expect(settings.get).toHaveBeenCalledWith(ANALYTICS_EVENTS_SETTING_KEY)
  })

  it('збережене перекриває дефолт лише для своїх ключів; невідомі ключі відкидаються', async () => {
    const stored = JSON.stringify({ [KEY]: { enabled: false, eventNames: ['my_cta', 'my_cta', 'Bad Name'] }, bogus_key: { enabled: false } })
    const { uc } = setup(stored)
    const r = await uc.getEvents()
    expect(r.events[KEY]).toEqual({ enabled: false, eventNames: ['my_cta'], eventName: 'my_cta' })
    expect(r.events[OTHER]).toEqual(getDefaultAnalyticsEvents()[OTHER])
    expect(r.events).not.toHaveProperty('bogus_key')
    expect(Object.keys(r.events)).toHaveLength(ANALYTICS_REGISTRY.length)
  })

  it('легасі-формат { eventName } читається', async () => {
    const { uc } = setup(JSON.stringify({ [KEY]: { eventName: 'legacy_name' } }))
    expect((await uc.getEvents()).events[KEY]).toEqual({ enabled: true, eventNames: ['legacy_name'], eventName: 'legacy_name' })
  })

  it('битий JSON у БД → дефолти, без падіння', async () => {
    quiet()
    const { uc } = setup('{not json')
    expect((await uc.getEvents()).events).toEqual(getDefaultAnalyticsEvents())
  })
})

describe('patchEvents', () => {
  it('невалідне тіло → invalid, нічого не пишеться і кеш не скидається', async () => {
    const { uc, settings, cache, audit } = setup()
    expect(await uc.patchEvents({ events: 'str' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Поле events має бути обʼєктом' })
    expect(await uc.patchEvents({ events: { unknown_point: { enabled: true } } }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Невідома точка взаємодії: unknown_point' })
    expect(await uc.patchEvents({ events: { [KEY]: { enabled: 'yes' } } }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.patchEvents({ events: { [KEY]: { enabled: true, eventNames: ['Bad-Name'] } } }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.patchEvents({ events: { [KEY]: { enabled: true, eventNames: ['a', 'a'] } } }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(settings.upsertMany).not.toHaveBeenCalled()
    expect(cache.invalidateSite).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('валідний патч → мерж зі збереженим у site_settings.analytics_events (type json, актор, годинник) + invalidate + audit', async () => {
    const stored = { [OTHER]: { enabled: false, eventNames: ['old_phone'], eventName: 'old_phone' } }
    const { uc, settings, cache, audit } = setup(JSON.stringify(stored))
    const r = await uc.patchEvents({ events: { [KEY]: { enabled: true, eventNames: ['new_cta', 'generate_lead'] } } }, actor)
    expect(r.ok).toBe(true)
    const patch = { [KEY]: { enabled: true, eventNames: ['new_cta', 'generate_lead'], eventName: 'new_cta' } }
    expect(settings.upsertMany).toHaveBeenCalledOnce()
    const [rows] = settings.upsertMany.mock.calls[0] as unknown as [Array<{ key: string; value: string; type: string; updated_at: string; updated_by: string }>]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: ANALYTICS_EVENTS_SETTING_KEY, type: 'json', updated_at: NOW.toISOString(), updated_by: actor.id })
    // Сохранённое (другой ключ) не потеряно, новый ключ добавлен.
    expect(JSON.parse(rows[0].value)).toEqual({ ...stored, ...patch })
    expect(cache.invalidateSite).toHaveBeenCalledOnce()
    expect(audit.record).toHaveBeenCalledWith(actor, 'analytics_events.update', 'site_settings/analytics_events', { new: patch })
    // Ответ — полный мерж дефолтов с сохранённым (в фейке get отдаёт старое значение, так что
    // видно только сохранённое ранее; главное — форма ответа).
    expect(r.ok && r.value.events[OTHER]).toEqual(stored[OTHER])
    expect(Object.keys(r.ok ? r.value.events : {})).toHaveLength(ANALYTICS_REGISTRY.length)
  })

  it('легасі eventName у патчі → trim і один елемент масиву; порожній запис → точка мовчить', async () => {
    const { uc, settings } = setup()
    await uc.patchEvents({ events: { [KEY]: { enabled: true, eventName: '  solo ' }, [OTHER]: { enabled: false } } }, actor)
    const [rows] = settings.upsertMany.mock.calls[0] as unknown as [Array<{ value: string }>]
    expect(JSON.parse(rows[0].value)).toEqual({
      [KEY]: { enabled: true, eventNames: ['solo'], eventName: 'solo' },
      [OTHER]: { enabled: false, eventNames: [], eventName: OTHER },
    })
  })

  it('events не передано → без запису й без audit, але кеш скидається; відповідь — поточний мерж', async () => {
    const { uc, settings, cache, audit } = setup(JSON.stringify({ [KEY]: { enabled: false } }))
    const r = await uc.patchEvents({}, actor)
    expect(r.ok).toBe(true)
    expect(settings.upsertMany).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
    expect(cache.invalidateSite).toHaveBeenCalledOnce()
    expect(r.ok && r.value.events[KEY]).toEqual({ enabled: false, eventNames: [], eventName: KEY })
  })

  it('помилка upsert → failed «Помилка сервера», без invalidate і audit', async () => {
    quiet()
    const { uc, cache, audit } = setup(null, { upsertMany: vi.fn(async () => dbFail('boom')) })
    expect(await uc.patchEvents({ events: { [KEY]: { enabled: true } } }, actor)).toMatchObject({ ok: false, code: 'failed', message: 'Помилка сервера' })
    expect(cache.invalidateSite).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })
})
