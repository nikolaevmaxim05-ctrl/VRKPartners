// Довідники адмінки на фейкових портах: кастомні поля, Google-теги, site_settings, секрети інтеграцій.
import { describe, it, expect, vi } from 'vitest'
import { makeCustomFieldUseCases } from '../manage-custom-fields'
import { makeTrackingTagUseCases } from '../manage-tracking-tags'
import { makeSettingsUseCases } from '../update-settings'
import { makeIntegrationUseCases } from '../manage-integrations'
import { dbOk, dbFail, UNIQUE_VIOLATION } from '../../../ports/common'

const actor = { id: 'u1', email: 'a@b.c' }
const NOW = new Date('2026-04-01T09:00:00.000Z')

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

// ── Кастомні поля ────────────────────────────────────────────────────────────

function setupFields(over: Record<string, unknown> = {}) {
  const customFields = {
    list: vi.fn(async () => dbOk([])),
    listForLead: vi.fn(),
    get: vi.fn(async (id: string) => ({ id, type: 'select', options: ['a'], required: false })),
    maxPosition: vi.fn(async () => 4),
    insert: vi.fn(async (values: Record<string, unknown>) => dbOk({ id: 'cf-new', ...values })),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => dbOk({ id, ...patch })),
    delete: vi.fn(async () => dbOk(undefined)),
    valuesForLead: vi.fn(),
    ...over,
  }
  const audit = { record: vi.fn(async () => {}) }
  return { uc: makeCustomFieldUseCases({ customFields, audit } as never), customFields, audit }
}

describe('makeCustomFieldUseCases', () => {
  it('createField: позиція = max + 1, ключ у нижньому регістрі; audit custom_field.create', async () => {
    const { uc, customFields, audit } = setupFields()
    const r = await uc.createField({ name: ' Бюджет ', field_key: ' Budget_Q1 ', type: 'number', required: true }, actor)
    expect(r.ok).toBe(true)
    const value = { name: 'Бюджет', field_key: 'budget_q1', type: 'number', options: null, required: true }
    expect(customFields.insert).toHaveBeenCalledWith({ ...value, position: 5 })
    expect(audit.record).toHaveBeenCalledWith(actor, 'custom_field.create', 'lead_custom_fields/cf-new', { new: value })
  })

  it('createField: помилка валідації → invalid без звернення до БД', async () => {
    const { uc, customFields } = setupFields()
    expect(await uc.createField({ name: 'X', field_key: '1bad' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.createField({ name: 'X', field_key: 'sel', type: 'select' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Для типу select потрібен список опцій' })
    expect(customFields.maxPosition).not.toHaveBeenCalled()
  })

  it('createField: unique_violation → conflict; інша помилка → failed', async () => {
    quiet()
    const c = setupFields({ insert: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) })
    expect(await c.uc.createField({ name: 'X', field_key: 'x' }, actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Поле з таким ключем вже існує' })
    expect(c.audit.record).not.toHaveBeenCalled()
    const f = setupFields({ insert: vi.fn(async () => dbFail('boom')) })
    expect(await f.uc.createField({ name: 'X', field_key: 'x' }, actor)).toMatchObject({ ok: false, code: 'failed' })
  })

  it('updateField: не знайдено → not_found; опції для не-select → invalid; успіх → update + audit', async () => {
    const nf = setupFields({ get: vi.fn(async () => null) })
    expect(await nf.uc.updateField('cf-x', { name: 'X' }, actor)).toMatchObject({ ok: false, code: 'not_found' })
    const text = setupFields({ get: vi.fn(async () => ({ id: 'cf-1', type: 'text', options: null, required: false })) })
    expect(await text.uc.updateField('cf-1', { options: ['a'] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Опції лише для типу select' })
    const { uc, customFields, audit } = setupFields()
    const r = await uc.updateField('cf-1', { options: [' a ', '', 'b'], position: 2.9 }, actor)
    expect(r.ok).toBe(true)
    expect(customFields.update).toHaveBeenCalledWith('cf-1', { options: ['a', 'b'], position: 2 })
    expect(audit.record).toHaveBeenCalledWith(actor, 'custom_field.update', 'lead_custom_fields/cf-1', { new: { options: ['a', 'b'], position: 2 } })
  })

  it('deleteField: ok → delete + audit custom_field.delete зі старим визначенням; неіснуюче → not_found; помилка → failed', async () => {
    quiet()
    const { uc, customFields, audit } = setupFields()
    expect(await uc.deleteField('cf-1', actor)).toEqual({ ok: true, value: undefined })
    expect(customFields.delete).toHaveBeenCalledWith('cf-1')
    expect(audit.record).toHaveBeenCalledWith(actor, 'custom_field.delete', 'lead_custom_fields/cf-1', { old: expect.objectContaining({ id: 'cf-1' }) })
    const missing = setupFields({ get: vi.fn(async () => null) })
    expect(await missing.uc.deleteField('cf-x', actor)).toMatchObject({ ok: false, code: 'not_found' })
    expect(missing.customFields.delete).not.toHaveBeenCalled()
    const f = setupFields({ delete: vi.fn(async () => dbFail('boom')) })
    expect(await f.uc.deleteField('cf-1', actor)).toMatchObject({ ok: false, code: 'failed' })
    expect(f.audit.record).not.toHaveBeenCalled()
  })
})

// ── Google-теги ──────────────────────────────────────────────────────────────

function setupTags(over: Record<string, unknown> = {}) {
  const tags = {
    list: vi.fn(async () => dbOk([])),
    listEnabled: vi.fn(async () => dbOk([])),
    getType: vi.fn(async (id: string) => ({ id, type: 'aw' as const })),
    exists: vi.fn(async () => true),
    maxPosition: vi.fn(async () => 1),
    insert: vi.fn(async (values: Record<string, unknown>) => dbOk({ id: 'tt-new', ...values })),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => dbOk({ id, ...patch })),
    delete: vi.fn(async () => dbOk(undefined)),
    ...over,
  }
  const cache = { invalidateSite: vi.fn(), invalidatePaths: vi.fn() }
  const audit = { record: vi.fn(async () => {}) }
  return { uc: makeTrackingTagUseCases({ tags, cache, audit } as never), tags, cache, audit }
}

describe('makeTrackingTagUseCases', () => {
  it('createTag: невірний тип / формат ID / label для ga4 → invalid, кеш не скидається', async () => {
    const { uc, tags, cache } = setupTags()
    expect(await uc.createTag({ type: 'fb', tag_id: 'X' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Тип тегу: ga4 / gtm / aw' })
    expect(await uc.createTag({ type: 'ga4', tag_id: 'GTM-ABC' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.createTag({ type: 'ga4', tag_id: 'G-ABC123', conversion_label: 'L' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(tags.insert).not.toHaveBeenCalled()
    expect(cache.invalidateSite).not.toHaveBeenCalled()
  })

  it('createTag: unique_violation → conflict без скидання кешу; ok → insert(position max+1) + invalidateSite + audit', async () => {
    quiet()
    const c = setupTags({ insert: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) })
    expect(await c.uc.createTag({ type: 'aw', tag_id: 'AW-123' }, actor)).toMatchObject({ ok: false, code: 'conflict', message: 'Тег з таким ID вже існує' })
    expect(c.cache.invalidateSite).not.toHaveBeenCalled()
    expect(c.audit.record).not.toHaveBeenCalled()

    const { uc, tags, cache, audit } = setupTags()
    const r = await uc.createTag({ type: 'aw', tag_id: ' AW-123 ', label: ' Ads ', conversion_label: 'AbC_1', enabled: false }, actor)
    expect(r.ok).toBe(true)
    const value = { type: 'aw', tag_id: 'AW-123', label: 'Ads', conversion_label: 'AbC_1', enabled: false }
    expect(tags.insert).toHaveBeenCalledWith({ ...value, position: 2 })
    expect(cache.invalidateSite).toHaveBeenCalledOnce()
    expect(audit.record).toHaveBeenCalledWith(actor, 'tracking_tag.create', 'tracking_tags/tt-new', { new: value })
  })

  it('updateTag: не знайдено → not_found; conflict; ok → update + invalidateSite + audit', async () => {
    const nf = setupTags({ getType: vi.fn(async () => null) })
    expect(await nf.uc.updateTag('tt-x', { enabled: false }, actor)).toMatchObject({ ok: false, code: 'not_found', message: 'Тег не знайдено' })
    const c = setupTags({ update: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) })
    expect(await c.uc.updateTag('tt-1', { tag_id: 'AW-999' }, actor)).toMatchObject({ ok: false, code: 'conflict' })
    expect(c.cache.invalidateSite).not.toHaveBeenCalled()
    const { uc, tags, cache, audit } = setupTags()
    expect((await uc.updateTag('tt-1', { enabled: true, conversion_label: '' }, actor)).ok).toBe(true)
    expect(tags.update).toHaveBeenCalledWith('tt-1', { enabled: true, conversion_label: null })
    expect(cache.invalidateSite).toHaveBeenCalledOnce()
    expect(audit.record).toHaveBeenCalledWith(actor, 'tracking_tag.update', 'tracking_tags/tt-1', { new: { enabled: true, conversion_label: null } })
  })

  it('updateTag: tag_id перевіряється за ПОТОЧНИМ типом (ga4-тег не приймає AW-…)', async () => {
    const { uc, tags } = setupTags({ getType: vi.fn(async () => ({ id: 'tt-1', type: 'ga4' })) })
    expect(await uc.updateTag('tt-1', { tag_id: 'AW-123' }, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(tags.update).not.toHaveBeenCalled()
  })

  it('deleteTag: не існує → not_found; ok → delete + invalidateSite + audit без значень', async () => {
    const nf = setupTags({ exists: vi.fn(async () => false) })
    expect(await nf.uc.deleteTag('tt-x', actor)).toMatchObject({ ok: false, code: 'not_found' })
    expect(nf.tags.delete).not.toHaveBeenCalled()
    const { uc, tags, cache, audit } = setupTags()
    expect(await uc.deleteTag('tt-1', actor)).toEqual({ ok: true, value: undefined })
    expect(tags.delete).toHaveBeenCalledWith('tt-1')
    expect(cache.invalidateSite).toHaveBeenCalledOnce()
    expect(audit.record).toHaveBeenCalledWith(actor, 'tracking_tag.delete', 'tracking_tags/tt-1')
  })

  it('listEnabledForSite: відкидає рядки з невалідним tag_id; помилка БД → []', async () => {
    quiet()
    const rows = [
      { type: 'ga4', tag_id: 'G-ABC123', conversion_label: null },
      { type: 'ga4', tag_id: 'g-lower', conversion_label: null },
      { type: 'gtm', tag_id: 'GTM-XYZ', conversion_label: null },
      { type: 'aw', tag_id: 'AW-12ab', conversion_label: 'L' },
      { type: 'aw', tag_id: 'AW-123', conversion_label: 'L' },
      { type: 'fb', tag_id: 'FB-1', conversion_label: null },
    ]
    const { uc } = setupTags({ listEnabled: vi.fn(async () => dbOk(rows)) })
    expect(await uc.listEnabledForSite()).toEqual([rows[0], rows[2], rows[4]])
    const f = setupTags({ listEnabled: vi.fn(async () => dbFail('boom')) })
    expect(await f.uc.listEnabledForSite()).toEqual([])
  })
})

// ── site_settings ────────────────────────────────────────────────────────────

function setupSettings(over: Record<string, unknown> = {}) {
  const settings = {
    getMany: vi.fn(),
    get: vi.fn(),
    listAll: vi.fn(async () =>
      dbOk([
        { key: 'internal_currency', value: 'UAH', type: 'string', updated_at: null },
        { key: 'telephony_secret', value: 'shh', type: 'string', updated_at: null },
        { key: 'dedup_by_phone', value: 'true', type: 'boolean', updated_at: null },
      ]),
    ),
    upsertMany: vi.fn(async () => dbOk(undefined)),
    ...over,
  }
  const audit = { record: vi.fn(async () => {}) }
  return { uc: makeSettingsUseCases({ settings, clock: { now: () => NOW }, audit } as never), settings, audit }
}

describe('makeSettingsUseCases', () => {
  it('getSettings: telephony_secret відфільтровано; помилка БД → failed', async () => {
    quiet()
    const { uc } = setupSettings()
    const r = await uc.getSettings()
    expect(r.ok && r.value.map((s) => s.key)).toEqual(['internal_currency', 'dedup_by_phone'])
    const f = setupSettings({ listAll: vi.fn(async () => dbFail('boom')) })
    expect(await f.uc.getSettings()).toMatchObject({ ok: false, code: 'failed' })
  })

  it('updateSettings: невідомий ключ / порожній items / невалідне значення → invalid, без запису', async () => {
    const { uc, settings, audit } = setupSettings()
    expect(await uc.updateSettings({ items: [{ key: 'telephony_secret', value: 'x' }] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Невідомий ключ: telephony_secret' })
    expect(await uc.updateSettings({ items: [] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Порожній items' })
    expect(await uc.updateSettings({ items: [{ key: 'internal_currency', value: 'GBP' }] }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Валюта: UAH, USD або EUR' })
    expect(settings.upsertMany).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('updateSettings: ok → upsertMany з updated_by = actor.id і updated_at з годинника; audit settings.update лише key/value', async () => {
    const { uc, settings, audit } = setupSettings()
    const r = await uc.updateSettings(
      { items: [{ key: 'dedup_by_phone', value: true }, { key: 'dedup_ip_window_hours', value: '12.8' }, { key: 'internal_currency', value: ' USD ' }] },
      actor,
    )
    expect(r).toEqual({ ok: true, value: undefined })
    expect(settings.upsertMany).toHaveBeenCalledWith([
      { key: 'dedup_by_phone', value: 'true', type: 'boolean', updated_at: NOW.toISOString(), updated_by: actor.id },
      { key: 'dedup_ip_window_hours', value: '12', type: 'number', updated_at: NOW.toISOString(), updated_by: actor.id },
      { key: 'internal_currency', value: 'USD', type: 'string', updated_at: NOW.toISOString(), updated_by: actor.id },
    ])
    expect(audit.record).toHaveBeenCalledWith(actor, 'settings.update', 'site_settings', {
      new: [
        { key: 'dedup_by_phone', value: 'true' },
        { key: 'dedup_ip_window_hours', value: '12' },
        { key: 'internal_currency', value: 'USD' },
      ],
    })
  })

  it('updateSettings: помилка upsert → failed, без audit', async () => {
    quiet()
    const { uc, audit } = setupSettings({ upsertMany: vi.fn(async () => dbFail('boom')) })
    expect(await uc.updateSettings({ items: [{ key: 'pipelines_enabled', value: 'true' }] }, actor)).toMatchObject({ ok: false, code: 'failed' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

// ── Секрети інтеграцій ───────────────────────────────────────────────────────

function setupIntegrations(over: { secrets?: Record<string, unknown>; notificationEmail?: () => string | undefined } = {}) {
  const secrets = {
    listDecrypted: vi.fn(async () =>
      dbOk([
        { key: 'telegram_bot_token', plain: '123456:ABCDEF', updated_at: '2026-01-01T00:00:00Z' },
        { key: 'google_spreadsheet_id', plain: 'sheet-id-0001', updated_at: null },
        { key: 'smtp_password', plain: null, updated_at: null },
        { key: 'smtp_from', plain: 'abc', updated_at: null },
      ]),
    ),
    set: vi.fn(async () => dbOk(undefined)),
    delete: vi.fn(async () => dbOk(undefined)),
    read: vi.fn(async () => ({ status: 'missing' as const })),
    ...over.secrets,
  }
  const tester = {
    telegram: vi.fn(async () => ({ ok: true, message: 'tg ok' })),
    keycrm: vi.fn(async () => ({ ok: true, message: 'crm ok' })),
    smtp: vi.fn(async () => ({ ok: true, message: 'smtp ok' })),
  }
  const sheets = { sendConversion: vi.fn(), sendAdjustment: vi.fn(), testConnection: vi.fn(async () => ({ ok: false, main: { ok: false, message: 'x' } })) }
  const audit = { record: vi.fn(async () => {}) }
  const deps = { secrets, tester, sheets, clock: { now: () => NOW }, notificationEmail: over.notificationEmail ?? (() => undefined), audit }
  return { uc: makeIntegrationUseCases(deps as never), secrets, tester, sheets, audit }
}

describe('makeIntegrationUseCases', () => {
  it('setIntegration: невідомий ключ → invalid; порожнє значення → invalid; у БД нічого не пишеться', async () => {
    const { uc, secrets, audit } = setupIntegrations()
    expect(await uc.setIntegration('aws_secret', { value: 'x' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Невідома інтеграція' })
    expect(await uc.setIntegration('telegram_bot_token', { value: '   ' }, actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Value is required' })
    expect(await uc.setIntegration('telegram_bot_token', {}, actor)).toMatchObject({ ok: false, code: 'invalid' })
    expect(secrets.set).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('setIntegration: ok → set(key, trim, actor.id, now); audit integration.set БЕЗ обʼєкта значень', async () => {
    const { uc, secrets, audit } = setupIntegrations()
    expect(await uc.setIntegration('telegram_bot_token', { value: '  123:abc  ' }, actor)).toEqual({ ok: true, value: undefined })
    expect(secrets.set).toHaveBeenCalledWith('telegram_bot_token', '123:abc', actor.id, NOW.toISOString())
    expect(audit.record).toHaveBeenCalledWith(actor, 'integration.set', 'integrations/telegram_bot_token')
    const call = audit.record.mock.calls[0] as unknown[]
    expect(call).toHaveLength(3)
    expect(call[3]).toBeUndefined()
    // Секрет не потрапляє в жоден аргумент журналу.
    expect(JSON.stringify(call)).not.toContain('123:abc')
  })

  it('setIntegration: помилка запису → failed, без audit', async () => {
    const { uc, audit } = setupIntegrations({ secrets: { set: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.setIntegration('keycrm_api_key', { value: 'k' }, actor)).toMatchObject({ ok: false, code: 'failed' })
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('listIntegrations: masked_value для всіх, plaintext лише для PLAINTEXT-ключів; нерозшифроване → null/null', async () => {
    const { uc } = setupIntegrations()
    const r = await uc.listIntegrations()
    expect(r.ok && r.value).toEqual([
      { key: 'telegram_bot_token', is_set: true, masked_value: '••••••••••••CDEF', value: null, updated_at: '2026-01-01T00:00:00Z' },
      { key: 'google_spreadsheet_id', is_set: true, masked_value: '••••••••••••0001', value: 'sheet-id-0001', updated_at: null },
      { key: 'smtp_password', is_set: true, masked_value: null, value: null, updated_at: null },
      { key: 'smtp_from', is_set: true, masked_value: '••••', value: 'abc', updated_at: null },
    ])
    const f = setupIntegrations({ secrets: { listDecrypted: vi.fn(async () => dbFail('boom')) } })
    expect(await f.uc.listIntegrations()).toMatchObject({ ok: false, code: 'failed' })
  })

  it('testIntegration: missing / decrypt_error → повідомлення без звернення до тестера', async () => {
    const missing = setupIntegrations()
    expect(await missing.uc.testIntegration('telegram_bot_token', actor)).toEqual({ ok: false, message: 'Ключ не знайдено в базі. Спочатку збережіть значення.' })
    const bad = setupIntegrations({ secrets: { read: vi.fn(async () => ({ status: 'decrypt_error' })) } })
    expect(await bad.uc.testIntegration('telegram_bot_token', actor)).toEqual({ ok: false, message: 'Помилка дешифрування. Перевірте ADMIN_ENCRYPTION_KEY.' })
    expect(missing.tester.telegram).not.toHaveBeenCalled()
    expect(bad.tester.telegram).not.toHaveBeenCalled()
  })

  it('testIntegration: telegram / keycrm → тестер зі значенням із БД; інший ключ → підтвердження збереження', async () => {
    const { uc, tester } = setupIntegrations({ secrets: { read: vi.fn(async (k: string) => ({ status: 'ok', value: `v:${k}` })) } })
    expect(await uc.testIntegration('telegram_bot_token', actor)).toEqual({ ok: true, message: 'tg ok' })
    expect(tester.telegram).toHaveBeenCalledWith('v:telegram_bot_token')
    expect(await uc.testIntegration('keycrm_api_key', actor)).toEqual({ ok: true, message: 'crm ok' })
    expect(tester.keycrm).toHaveBeenCalledWith('v:keycrm_api_key')
    expect(await uc.testIntegration('google_spreadsheet_id', actor)).toEqual({ ok: true, message: 'Значення збережено в базі ✓' })
  })

  it('testIntegration smtp: без smtp_user → підказка; з ним → tester.smtp(user, password, from|user, to = env|actor.email|user)', async () => {
    const store: Record<string, string> = { smtp_password: 'pw', smtp_user: 'me@gmail.com' }
    const read = vi.fn(async (k: string) => (k in store ? { status: 'ok', value: store[k] } : { status: 'missing' }))
    const noUser = setupIntegrations({ secrets: { read: vi.fn(async (k: string) => (k === 'smtp_password' ? { status: 'ok', value: 'pw' } : { status: 'missing' })) } })
    expect(await noUser.uc.testIntegration('smtp_password', actor)).toEqual({ ok: false, message: 'Спочатку збережіть Gmail-адресу (поле «Gmail-адреса»).' })
    expect(noUser.tester.smtp).not.toHaveBeenCalled()

    const env = setupIntegrations({ secrets: { read }, notificationEmail: () => ' ops@vrk.test ' })
    await env.uc.testIntegration('smtp_password', actor)
    expect(env.tester.smtp).toHaveBeenCalledWith({ user: 'me@gmail.com', password: 'pw', from: 'me@gmail.com', to: 'ops@vrk.test' })

    const fromActor = setupIntegrations({ secrets: { read } })
    await fromActor.uc.testIntegration('smtp_password', actor)
    expect(fromActor.tester.smtp).toHaveBeenCalledWith(expect.objectContaining({ to: actor.email }))

    store.smtp_from = 'noreply@vrk.test'
    const noEmail = setupIntegrations({ secrets: { read } })
    await noEmail.uc.testIntegration('smtp_password', { id: 'u2', email: null })
    expect(noEmail.tester.smtp).toHaveBeenCalledWith({ user: 'me@gmail.com', password: 'pw', from: 'noreply@vrk.test', to: 'me@gmail.com' })
  })

  it('deleteIntegration: невідомий ключ → invalid; ok → delete + audit integration.delete', async () => {
    const { uc, secrets, audit } = setupIntegrations()
    expect(await uc.deleteIntegration('nope', actor)).toMatchObject({ ok: false, code: 'invalid', message: 'Невідома інтеграція' })
    expect(secrets.delete).not.toHaveBeenCalled()
    expect(await uc.deleteIntegration('telephony_secret', actor)).toEqual({ ok: true, value: undefined })
    expect(secrets.delete).toHaveBeenCalledWith('telephony_secret')
    expect(audit.record).toHaveBeenCalledWith(actor, 'integration.delete', 'integrations/telephony_secret')
  })

  it('testGoogleSheets делегує адаптеру', async () => {
    const { uc, sheets } = setupIntegrations()
    expect(await uc.testGoogleSheets()).toEqual({ ok: false, main: { ok: false, message: 'x' } })
    expect(sheets.testConnection).toHaveBeenCalledOnce()
  })
})
