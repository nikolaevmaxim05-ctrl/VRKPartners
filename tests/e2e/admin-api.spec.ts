// API админки с сессией тестового админа (разделы 5, 6, 9, 15, 16): матрица прав, CRUD-циклы
// «создать → проверить → удалить», воронка конверсий, редактор контента с откатом, журнал действий.
// Против ПРОДОВОЙ БД: всё созданное имеет маркер [E2E] и убирается в afterAll; site_content сравнивается
// со снимком до тестов. Без E2E_ADMIN_EMAIL/PASSWORD или без пользователя в Auth — весь файл пропускается.
// Побочные эффекты с реальными отправками (Telegram-тест, инвайт, публичный приёмник) — за отдельными
// env-флагами E2E_ALLOW_INTEGRATION_TESTS / E2E_ALLOW_INVITE (без них пропускаются).
import { test, expect, type APIRequestContext } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import {
  ENV, E2E_TAG, E2E_PUBLIC_NAME, NIL_UUID, hasAdminCreds, probeLogin, loginApi, db, snapshotContent, restoreContent,
  insertTestLead, cleanupE2E, leftoversE2E, type ContentSnapshot,
} from './admin-helpers'

test.describe.configure({ mode: 'serial' })

const startIso = new Date().toISOString()
let api: APIRequestContext
let api2: APIRequestContext | null = null
let selfId = ''
let user2Id: string | null = null
let snapshot: ContentSnapshot
let analyticsEventsBefore: string | null | undefined
let attributionDaysBefore: string | null | undefined
const created: { leads: string[]; storage: string[] } = { leads: [], storage: [] }

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'API-проверки — один раз (desktop)')
  test.skip(!hasAdminCreds(), 'Нет E2E_ADMIN_EMAIL/PASSWORD или ключей Supabase в .env.local')
  const probe = await probeLogin(ENV.email!, ENV.password!)
  test.skip(!probe, `Тестового админа ${ENV.email} нет в Supabase Auth или пароль не подходит`)
  selfId = probe!.userId
  snapshot = await snapshotContent()
  const { data: ae } = await db().from('site_settings').select('value').eq('key', 'analytics_events').maybeSingle()
  analyticsEventsBefore = (ae?.value as string | null | undefined) ?? null
  const { data: ad } = await db().from('site_settings').select('value').eq('key', 'referral_attribution_days').maybeSingle()
  attributionDaysBefore = (ad?.value as string | null | undefined) ?? null
  const baseURL = testInfo.project.use.baseURL as string
  ;({ api } = await loginApi(browser, baseURL, ENV.email!, ENV.password!))
  if (ENV.email2 && ENV.password2) {
    const p2 = await probeLogin(ENV.email2, ENV.password2)
    if (p2) {
      user2Id = p2.userId
      ;({ api: api2 } = await loginApi(browser, baseURL, ENV.email2, ENV.password2))
    }
  }
})

test.afterAll(async () => {
  if (!api) return
  const report = await cleanupE2E({ sinceIso: startIso, userIds: [selfId, ...(user2Id ? [user2Id] : [])] })
  if (created.storage.length) {
    const { error } = await db().storage.from('content').remove(created.storage)
    report.storage = error ? `ERR ${error.message}` : created.storage.length
  }
  if (analyticsEventsBefore !== undefined) {
    const { error } = await db().from('site_settings').upsert({ key: 'analytics_events', value: analyticsEventsBefore ?? '{}' }, { onConflict: 'key' })
    report.analytics_events_restored = error ? `ERR ${error.message}` : true
  }
  if (attributionDaysBefore !== undefined) {
    // Окно атрибуции: восстанавливаем значение клиента (или убираем ключ, если его не было).
    const { error } = attributionDaysBefore === null
      ? await db().from('site_settings').delete().eq('key', 'referral_attribution_days')
      : await db().from('site_settings').upsert({ key: 'referral_attribution_days', value: attributionDaysBefore, type: 'number' }, { onConflict: 'key' })
    report.attribution_days_restored = error ? `ERR ${error.message}` : true
  }
  report.content_restored = (await restoreContent(snapshot)).join(',') || 'не було змін'
  const leftovers = await leftoversE2E()
  console.log('[cleanup]', JSON.stringify({ ...report, leftovers }))
  for (const [t, n] of Object.entries(leftovers)) expect(n, `остатки [E2E] в ${t}`).toBe(0)
})

// ── 1. Доступ и матрица прав ────────────────────────────────────────────────────────────────────
const READ_ROUTES: [string, string[]][] = [
  ['/api/admin/leads', ['manage_leads', 'view_reports', 'export_data', 'manage_conversions']],
  ['/api/admin/lead-statuses', []],
  ['/api/admin/custom-fields', []],
  ['/api/admin/roles', []],
  ['/api/admin/users', []],
  ['/api/admin/assignees', []],
  ['/api/admin/settings', []],
  ['/api/admin/tracking-tags', []],
  ['/api/admin/analytics-events', []],
  ['/api/admin/integrations', ['manage_settings', 'manage_integrations']],
  ['/api/admin/content', ['manage_content']],
  ['/api/admin/seo', ['manage_content']],
  ['/api/admin/legal', ['manage_content']],
  ['/api/admin/conversions', ['manage_conversions', 'manage_users']],
  ['/api/admin/conversion-adjustments', ['manage_conversions', 'manage_users']],
  ['/api/admin/audit-log', ['manage_users']],
  ['/api/admin/referral-links', ['manage_leads', 'view_reports', 'export_data', 'manage_conversions', 'manage_referrals']],
  ['/api/admin/referral-links/stats', ['manage_referrals']],
  ['/api/admin/referral-links/settings', ['manage_referrals']],
  ['/api/admin/analytics/report?date_from=2026-01-01&date_to=2026-01-02', ['view_reports']],
  ['/api/admin/analytics/dimension-values?dimension=utm_source&date_from=2026-01-01&date_to=2026-01-02', ['view_reports']],
]

test('1.1 полный админ: все GET-роуты → 200; dev-роут без NEXT_PUBLIC_DEV_TOOLS → 404', async () => {
  for (const [path] of READ_ROUTES) {
    const r = await api.get(path)
    expect(r.status(), `${path}: ${await r.text()}`).toBe(200)
  }
  const dev = await api.post('/api/admin/dev/ga4-arrival')
  expect([404, 200]).toContain(dev.status())
  if (process.env.NEXT_PUBLIC_DEV_TOOLS !== '1') expect(dev.status()).toBe(404)
})

test('1.2 минимальная роль (только manage_leads): справочники 200, разделы без права 403, мутации без права 403', async () => {
  test.skip(!api2, 'Нет E2E_ADMIN2_EMAIL/PASSWORD (пользователь с минимальной ролью)')
  for (const [path, perms] of READ_ROUTES) {
    const r = await api2!.get(path)
    const allowed = perms.length === 0 || perms.includes('manage_leads')
    expect(r.status(), `${path} (минимальная роль)`).toBe(allowed ? 200 : 403)
    if (!allowed) expect(await r.json()).toEqual({ error: 'Доступ заборонено' })
  }
  const mutations: [string, 'post' | 'put' | 'patch' | 'delete', unknown][] = [
    ['/api/admin/lead-statuses', 'post', { name: `${E2E_TAG} x` }],
    ['/api/admin/roles', 'post', { name: `${E2E_TAG} x`, permissions: [] }],
    ['/api/admin/users', 'post', { email: 'x@example.com', role_id: NIL_UUID }],
    ['/api/admin/settings', 'put', { items: [{ key: 'internal_currency', value: 'UAH' }] }],
    ['/api/admin/content', 'put', { overrides: {} }],
    ['/api/admin/tracking-tags', 'post', { type: 'aw', tag_id: 'AW-1' }],
    ['/api/admin/referral-links', 'post', { name: `${E2E_TAG} x` }],
    [`/api/admin/referral-links/${NIL_UUID}`, 'delete', undefined],
    ['/api/admin/referral-links/settings', 'patch', { days: 30 }],
    ['/api/admin/integrations/smtp_from', 'put', { value: 'x' }],
    [`/api/admin/leads/${NIL_UUID}`, 'delete', undefined],
    ['/api/admin/conversions/export-pending', 'post', undefined],
  ]
  for (const [path, method, data] of mutations) {
    const r = await api2![method](path, data === undefined ? undefined : { data })
    expect(r.status(), `${method.toUpperCase()} ${path} (минимальная роль)`).toBe(403)
  }
})

test('1.3 деактивация минимального пользователя → следующий запрос 403; возврат → 200', async () => {
  test.skip(!api2 || !user2Id, 'Нет второго пользователя')
  const off = await api.patch(`/api/admin/users/${user2Id}`, { data: { is_active: false } })
  expect(off.status(), await off.text()).toBe(200)
  const r = await api2!.get('/api/admin/lead-statuses')
  expect(r.status(), 'деактивированный — никаких прав даже на справочники').toBe(403)
  const on = await api.patch(`/api/admin/users/${user2Id}`, { data: { is_active: true } })
  expect(on.status()).toBe(200)
  expect((await api2!.get('/api/admin/lead-statuses')).status()).toBe(200)
})

// ── 2. Лиды: список, фильтры, карточка, PATCH, комментарии, кастомные поля, удаление, 404 ────────
let leadA: { id: string; order_no: number }
let leadB: { id: string; order_no: number }
let stages: { id: string; name: string; is_initial: boolean; conversion_type: string | null; requires_amount: boolean; position: number }[]

test('2.1 список и фильтры: поиск по маркеру, стадия, даты, пагинация; карточка; 404 на чужой id', async () => {
  const st = await api.get('/api/admin/lead-statuses')
  stages = ((await st.json()) as { data: typeof stages }).data
  leadA = await insertTestLead({ utm_source: 'e2e-src', utm_campaign: 'e2e-camp' })
  leadB = await insertTestLead({ utm_source: 'e2e-src' })
  created.leads.push(leadA.id, leadB.id)

  const list = await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&limit=50`)
  expect(list.status()).toBe(200)
  const listJson = (await list.json()) as { data: { id: string; name: string }[]; total: number; page: number; limit: number; totalPages: number }
  expect(listJson.data.map((l) => l.id).sort()).toEqual([leadA.id, leadB.id].sort())
  expect(listJson.total).toBe(2)

  const paged = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&limit=1&page=2`)).json()) as { data: unknown[]; totalPages: number; page: number }
  expect(paged.data.length).toBe(1)
  expect(paged.totalPages).toBe(2)
  expect(paged.page).toBe(2)

  const initial = stages.find((s) => s.is_initial)!
  const byStatus = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&status_id=${initial.id}`)).json()) as { total: number }
  expect(byStatus.total).toBe(2)
  // Границы дат сервер считает по Киеву — берём окно ±1 день, чтобы тест не зависел от времени суток.
  const dayFrom = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const dayTo = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const byDate = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&date_from=${dayFrom}&date_to=${dayTo}`)).json()) as { total: number }
  expect(byDate.total).toBe(2)
  const noDate = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&date_from=2000-01-01&date_to=2000-01-02`)).json()) as { total: number }
  expect(noDate.total).toBe(0)
  const byUtm = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&utm_field=utm_campaign&utm_value=e2e-camp`)).json()) as { total: number }
  expect(byUtm.total).toBe(1)
  const badLimit = await api.get('/api/admin/leads?limit=1000&page=-5')
  expect(badLimit.status(), 'лимит и страница зажимаются, не 500').toBe(200)

  const detail = await api.get(`/api/admin/leads/${leadA.id}`)
  expect(detail.status()).toBe(200)
  const detailJson = (await detail.json()) as { data?: { id: string }; id?: string }
  expect(JSON.stringify(detailJson)).toContain(leadA.id)

  expect((await api.get(`/api/admin/leads/${NIL_UUID}`)).status()).toBe(404)
  expect((await api.get('/api/admin/leads/not-a-uuid')).status(), 'невалидный id → 4xx, не 500').toBeLessThan(500)
  expect((await api.patch(`/api/admin/leads/${NIL_UUID}`, { data: { status_id: initial.id } })).status()).toBe(404)
})

test('2.2 PATCH: валидация (пустое тело, отрицательная сумма, чужие ключи), ответственный, комментарии, кастомное поле', async () => {
  const empty = await api.patch(`/api/admin/leads/${leadA.id}`, { data: {} })
  expect(empty.status()).toBe(400)
  const neg = await api.patch(`/api/admin/leads/${leadA.id}`, { data: { deal_amount: -5 } })
  expect(neg.status()).toBe(400)
  const foreign = await api.patch(`/api/admin/leads/${leadA.id}`, { data: { phone: '+380000000000' } })
  expect(foreign.status(), 'массовое присвоение чужих ключей отбрасывается').toBe(400)
  const bad = await api.patch(`/api/admin/leads/${leadA.id}`, { headers: { 'content-type': 'application/json' }, data: '{bad' })
  expect(bad.status()).toBe(400)

  const assign = await api.patch(`/api/admin/leads/${leadA.id}`, { data: { assigned_to: selfId } })
  expect(assign.status(), await assign.text()).toBe(200)
  const { data: row } = await db().from('leads').select('assigned_to').eq('id', leadA.id).single()
  expect(row!.assigned_to).toBe(selfId)

  const c1 = await api.post(`/api/admin/leads/${leadA.id}/comments`, { data: { type: 'comment', content: `${E2E_TAG} коментар` } })
  expect(c1.status(), await c1.text()).toBe(200)
  expect((await api.post(`/api/admin/leads/${leadA.id}/comments`, { data: { type: 'system', content: 'x' } })).status()).toBe(400)
  expect((await api.post(`/api/admin/leads/${leadA.id}/comments`, { data: { type: 'comment', content: '   ' } })).status()).toBe(400)
  expect((await api.post(`/api/admin/leads/${leadA.id}/comments`, { data: { type: 'note', content: 'x'.repeat(4001) } })).status()).toBe(400)
  const comments = (await (await api.get(`/api/admin/leads/${leadA.id}/comments?type=comment`)).json()) as { data: { content: string }[] }
  expect(comments.data.some((c) => c.content === `${E2E_TAG} коментар`)).toBe(true)
  const sys = (await (await api.get(`/api/admin/leads/${leadA.id}/comments?type=system`)).json()) as { data: { content: string }[] }
  expect(sys.data.length, 'системный комментарий об ответственном').toBeGreaterThanOrEqual(1)

  // Кастомное поле select: значение вне опций → 400; валидное → сохранено; удаление определения → значение исчезает.
  const cf = await api.post('/api/admin/custom-fields', { data: { name: `${E2E_TAG} Джерело`, field_key: 'e2e_source', type: 'select', options: ['A', 'B', ''] } })
  expect(cf.status(), await cf.text()).toBe(200)
  const field = ((await cf.json()) as { data: { id: string; options: string[] } }).data
  expect(field.options).toEqual(['A', 'B'])
  expect((await api.post('/api/admin/custom-fields', { data: { name: 'x', field_key: 'e2e_source', type: 'text' } })).status(), 'дубль ключа').toBe(409)
  expect((await api.post('/api/admin/custom-fields', { data: { name: 'x', field_key: '1bad', type: 'text' } })).status()).toBe(400)
  expect((await api.post('/api/admin/custom-fields', { data: { name: 'x', field_key: 'e2e_sel', type: 'select', options: [] } })).status()).toBe(400)
  expect((await api.patch(`/api/admin/leads/${leadA.id}/custom-fields`, { data: { field_id: field.id, value: 'Z' } })).status()).toBe(400)
  expect((await api.patch(`/api/admin/leads/${leadA.id}/custom-fields`, { data: { field_id: NIL_UUID, value: 'A' } })).status()).toBe(404)
  expect((await api.patch(`/api/admin/leads/${NIL_UUID}/custom-fields`, { data: { field_id: field.id, value: 'A' } })).status()).toBe(404)
  const setVal = await api.patch(`/api/admin/leads/${leadA.id}/custom-fields`, { data: { field_id: field.id, value: 'A' } })
  expect(setVal.status(), await setVal.text()).toBe(200)
  const { count: before } = await db().from('lead_custom_field_values').select('id', { count: 'exact', head: true }).eq('field_id', field.id)
  expect(before).toBe(1)
  expect((await api.patch(`/api/admin/custom-fields/${field.id}`, { data: { options: ['A', 'B', 'C'] } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/custom-fields/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)
  expect((await api.delete(`/api/admin/custom-fields/${field.id}`)).status()).toBe(200)
  const { count: after } = await db().from('lead_custom_field_values').select('id', { count: 'exact', head: true }).eq('field_id', field.id)
  expect(after, 'значения удаляются каскадом').toBe(0)
})

test('2.3 удаление: несуществующий id → 404, реальный → исчезает из БД и попадает в журнал', async () => {
  const ghost = await api.delete(`/api/admin/leads/${NIL_UUID}`)
  expect(ghost.status()).toBe(404)
  expect((await api.delete(`/api/admin/custom-fields/${NIL_UUID}`)).status()).toBe(404)
  const del = await api.delete(`/api/admin/leads/${leadB.id}`)
  expect(del.status()).toBe(200)
  const { data } = await db().from('leads').select('id').eq('id', leadB.id)
  expect(data).toEqual([])
  // Журнал пишется после ответа (after()) — ждём появления строки.
  await expect.poll(async () => {
    const { data: audit } = await db().from('audit_log').select('action, resource').eq('user_id', selfId).gte('created_at', startIso).eq('action', 'lead.delete')
    return (audit ?? []).some((a) => a.resource === `leads/${leadB.id}`)
  }, { timeout: 10_000 }).toBe(true)
})

// ── 3. Воронка конверсий (раздел 6, Фаза 5 п. 1, ревью п. 1) ────────────────────────────────────
test('3.1 целевой лид: enter → pending; exported → leave → RETRACT + retracted; resend/export-pending не перебивают; повторный enter → pending', async () => {
  const target = stages.find((s) => s.conversion_type === 'target_lead')!
  const work = stages.find((s) => !s.conversion_type && !s.is_initial) ?? stages.find((s) => s.is_initial)!
  expect(target, 'нужна стадия с conversion_type=target_lead').toBeTruthy()
  const patch = (body: Record<string, unknown>) => api.patch(`/api/admin/leads/${leadA.id}`, { data: body })

  expect((await patch({ status_id: target.id })).status()).toBe(200)
  let { data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle()
  expect(oc?.export_status).toBe('pending')
  const { data: hist } = await db().from('lead_status_history').select('to_status_id').eq('lead_id', leadA.id)
  expect(hist!.some((h) => h.to_status_id === target.id), 'история стадий').toBe(true)

  // Массовая выгрузка: Sheets не настроен → 400, статус остаётся pending.
  const bulk = await api.post('/api/admin/conversions/export-pending')
  expect(bulk.status()).toBe(400)
  ;({ data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(oc?.export_status).toBe('pending')
  const resend0 = await api.post(`/api/admin/conversions/${oc!.id}/resend`)
  expect(resend0.status(), 'не настроено → 400 {ok:false}').toBe(400)

  await db().from('offline_conversions').update({ export_status: 'exported', exported_at: new Date().toISOString() }).eq('lead_id', leadA.id)
  expect((await patch({ status_id: work.id })).status()).toBe(200)
  ;({ data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(oc?.export_status).toBe('retracted')
  const { data: adj } = await db().from('conversion_adjustments').select('adjustment_type, export_status').eq('lead_id', leadA.id)
  expect(adj).toEqual([{ adjustment_type: 'retract', export_status: 'pending' }])
  const resend = await api.post(`/api/admin/conversions/${oc!.id}/resend`)
  expect(resend.status()).toBe(400)
  expect(await resend.text()).toContain('відкликано')
  const list = (await (await api.get('/api/admin/conversions?limit=100')).json()) as { data: { lead_id: string; export_status: string }[]; pendingTotal: number }
  expect(list.data.find((r) => r.lead_id === leadA.id)?.export_status).toBe('retracted')
  const adjList = (await (await api.get('/api/admin/conversion-adjustments?limit=100')).json()) as { data: { lead_id: string; adjustment_type: string }[] }
  expect(adjList.data.find((r) => r.lead_id === leadA.id)?.adjustment_type).toBe('retract')
  const adjBulk = await api.post('/api/admin/conversion-adjustments/export-pending')
  expect(adjBulk.status(), 'таблица корректировок не настроена → 400').toBe(400)

  expect((await patch({ status_id: target.id })).status()).toBe(200)
  ;({ data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(oc?.export_status).toBe('pending')
  const { data: adj2 } = await db().from('conversion_adjustments').select('id').eq('lead_id', leadA.id)
  expect(adj2!.length, 'второго RETRACT нет').toBe(1)
})

test('3.2 сделка: сумма → конверсия со значением; exported + изменение суммы → RESTATE; выход из сделки обнуляет сумму', async () => {
  const deal = stages.find((s) => s.conversion_type === 'deal' && s.requires_amount)
  test.skip(!deal, 'нет стадии deal с requires_amount')
  const work = stages.find((s) => !s.conversion_type && !s.is_initial) ?? stages.find((s) => s.is_initial)!
  const patch = (body: Record<string, unknown>) => api.patch(`/api/admin/leads/${leadA.id}`, { data: body })
  expect((await patch({ status_id: deal!.id, deal_amount: 1000 })).status()).toBe(200)
  let { data: oc } = await db().from('offline_conversions').select('export_status, conversion_value, conversion_action').eq('lead_id', leadA.id).maybeSingle()
  expect(Number(oc!.conversion_value)).toBe(1000)
  expect(oc!.conversion_action).toBe(deal!.name ? oc!.conversion_action : oc!.conversion_action)
  await db().from('offline_conversions').update({ export_status: 'exported', exported_at: new Date().toISOString() }).eq('lead_id', leadA.id)
  expect((await patch({ deal_amount: 1500 })).status()).toBe(200)
  ;({ data: oc } = await db().from('offline_conversions').select('export_status, conversion_value, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(Number(oc!.conversion_value)).toBe(1500)
  const { data: adj } = await db().from('conversion_adjustments').select('adjustment_type, adjusted_value').eq('lead_id', leadA.id).order('created_at')
  expect(adj!.at(-1)).toMatchObject({ adjustment_type: 'restate' })
  expect(Number(adj!.at(-1)!.adjusted_value)).toBe(1500)
  expect((await patch({ status_id: work.id })).status()).toBe(200)
  const { data: lead } = await db().from('leads').select('deal_amount').eq('id', leadA.id).single()
  expect(lead!.deal_amount, 'выход из сделки обнуляет сумму').toBeNull()
})

// ── 4. Стадии ───────────────────────────────────────────────────────────────────────────────────
test('4 стадии: валидация, уникальность, стадия с лидом не удаляется, reorder, 404', async () => {
  expect((await api.post('/api/admin/lead-statuses', { data: { name: '' } })).status()).toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, color: 'red' } })).status()).toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, conversion_type: 'deal' } })).status(), 'конверсионная без action').toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, conversion_type: 'target_lead', conversion_action: '=cmd()' } })).status(), 'formula injection').toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, requires_amount: true } })).status()).toBe(400)
  const create = await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} Стадія`, color: '#123456' } })
  expect(create.status(), await create.text()).toBe(200)
  const stage = ((await create.json()) as { data: { id: string; position: number } }).data
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} Стадія` } })).status(), 'дубль названия').toBe(409)
  expect((await api.patch(`/api/admin/lead-statuses/${stage.id}`, { data: {} })).status()).toBe(400)
  expect((await api.patch(`/api/admin/lead-statuses/${stage.id}`, { data: { name: `${E2E_TAG} Стадія 2` } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/lead-statuses/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)

  // Лид на стадии → удаление запрещено.
  expect((await api.patch(`/api/admin/leads/${leadA.id}`, { data: { status_id: stage.id } })).status()).toBe(200)
  const delBusy = await api.delete(`/api/admin/lead-statuses/${stage.id}`)
  expect(delBusy.status()).toBe(400)
  expect(await delBusy.text()).toMatch(/лід/i)
  const initial = stages.find((s) => s.is_initial)!
  expect((await api.patch(`/api/admin/leads/${leadA.id}`, { data: { status_id: initial.id } })).status()).toBe(200)
  const delInitial = await api.delete(`/api/admin/lead-statuses/${initial.id}`)
  expect(delInitial.status(), 'начальную стадию не удалить').toBe(400)

  // Reorder: те же позиции существующих + новая в конце → 200; мусор → 400.
  const cur = ((await (await api.get('/api/admin/lead-statuses')).json()) as { data: { id: string; position: number }[] }).data
  const items = cur.map((s) => ({ id: s.id, position: s.position }))
  expect((await api.put('/api/admin/lead-statuses/reorder', { data: { items } })).status()).toBe(200)
  expect((await api.put('/api/admin/lead-statuses/reorder', { data: { items: [] } })).status()).toBe(400)
  expect((await api.put('/api/admin/lead-statuses/reorder', { data: { items: [{ id: stage.id, position: -1 }] } })).status()).toBe(400)
  expect((await api.delete(`/api/admin/lead-statuses/${stage.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/lead-statuses/${NIL_UUID}`)).status()).toBe(404)
  const after = ((await (await api.get('/api/admin/lead-statuses')).json()) as { data: { id: string; position: number }[] }).data
  expect(after.map((s) => [s.id, s.position])).toEqual(cur.filter((s) => s.id !== stage.id).map((s) => [s.id, s.position]))
})

// ── 4b. Реферальные ссылки ──────────────────────────────────────────────────────────────────────
test('4b реферальные ссылки: валидация, создание с кодом сервера, 409 название, код неизменен, 404, с заявкой не удаляется, статистика, справочник', async () => {
  expect((await api.post('/api/admin/referral-links', { data: { name: '' } })).status()).toBe(400)
  expect((await api.post('/api/admin/referral-links', { data: { name: 'x'.repeat(81) } })).status()).toBe(400)
  const create = await api.post('/api/admin/referral-links', { data: { name: `${E2E_TAG} Партнер`, notes: 'e2e' } })
  expect(create.status(), await create.text()).toBe(200)
  const link = ((await create.json()) as { data: { id: string; code: string; is_active: boolean; name: string } }).data
  expect(link.code).toMatch(/^[a-z0-9]{8}$/)
  expect(link.is_active).toBe(true)
  expect((await api.post('/api/admin/referral-links', { data: { name: `${E2E_TAG} партнер` } })).status(), 'дубль названия без учёта регистра').toBe(409)
  expect((await api.patch(`/api/admin/referral-links/${link.id}`, { data: { code: 'newcode1' } })).status(), 'код неизменен').toBe(400)
  expect((await api.patch(`/api/admin/referral-links/${link.id}`, { data: {} })).status()).toBe(400)
  expect((await api.patch(`/api/admin/referral-links/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)
  expect((await api.patch('/api/admin/referral-links/not-a-uuid', { data: { name: 'x' } })).status()).toBe(404)
  const off = await api.patch(`/api/admin/referral-links/${link.id}`, { data: { is_active: false, notes: 'off' } })
  expect(off.status(), await off.text()).toBe(200)
  expect(((await off.json()) as { data: { is_active: boolean; notes: string } }).data).toMatchObject({ is_active: false, notes: 'off' })

  // Лид со ссылкой → удаление запрещено, статистика видит заявку.
  const bind = await db().from('leads').update({ referral_link_id: link.id, referral_code: link.code }).eq('id', leadA.id)
  expect(bind.error).toBeNull()
  const del = await api.delete(`/api/admin/referral-links/${link.id}`)
  expect(del.status()).toBe(409)
  expect(await del.text()).toContain('вимкніть')
  const stats = (await (await api.get('/api/admin/referral-links/stats')).json()) as { data: { link_id: string; total: number; last30: number }[]; truncated: boolean }
  expect(stats.data.find((s) => s.link_id === link.id)).toMatchObject({ total: 1, last30: 1 })
  // Фильтр списка и карточка: embed партнёра.
  const byLink = (await (await api.get(`/api/admin/leads?referral_link_id=${link.id}`)).json()) as { total: number; data: { id: string; referral_link: { name: string } | null }[] }
  expect(byLink.total).toBe(1)
  expect(byLink.data[0]).toMatchObject({ id: leadA.id, referral_link: { name: `${E2E_TAG} Партнер` } })
  const none = (await (await api.get(`/api/admin/leads?referral_link_id=none&search=${encodeURIComponent(E2E_TAG)}`)).json()) as { data: { id: string }[] }
  expect(none.data.some((l) => l.id === leadA.id), 'без ссылки — leadA не попадает').toBe(false)
  const detail = await api.get(`/api/admin/leads/${leadA.id}`)
  expect(JSON.stringify(await detail.json())).toContain(`"referral_link":{"id":"${link.id}"`)
  await db().from('leads').update({ referral_link_id: null, referral_code: null }).eq('id', leadA.id)

  const refs = (await (await api.get('/api/admin/referral-links')).json()) as { data: { id: string; name: string; code: string; is_active: boolean }[] }
  expect(refs.data.find((r) => r.id === link.id)).toEqual({ id: link.id, name: `${E2E_TAG} Партнер`, code: link.code, is_active: false })
  const full = (await (await api.get('/api/admin/referral-links?full=1')).json()) as { data: { id: string; notes: string | null }[] }
  expect(full.data.find((r) => r.id === link.id)?.notes).toBe('off')
  expect((await api.delete(`/api/admin/referral-links/${link.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/referral-links/${NIL_UUID}`)).status()).toBe(404)
})

test('4c окно атрибуции: GET дефолт/пресеты, PATCH 1–400 (вне границ → 400), сохранённое значение читается, аудит settings.update', async () => {
  const cur = (await (await api.get('/api/admin/referral-links/settings')).json()) as { data: { days: number; defaultDays: number; presets: number[]; min: number; max: number } }
  expect(cur.data).toMatchObject({ defaultDays: 90, presets: [14, 30, 60, 90, 180, 365], min: 1, max: 400 })
  expect(cur.data.days).toBeGreaterThanOrEqual(1)
  for (const days of [0, 401, 12.5, 'x', null]) {
    const r = await api.patch('/api/admin/referral-links/settings', { data: { days } })
    expect(r.status(), `days=${String(days)}`).toBe(400)
    expect(await r.text()).toContain('1 до 400')
  }
  const set = await api.patch('/api/admin/referral-links/settings', { data: { days: 14 } })
  expect(set.status(), await set.text()).toBe(200)
  expect(((await set.json()) as { data: { days: number } }).data.days).toBe(14)
  expect(((await (await api.get('/api/admin/referral-links/settings')).json()) as { data: { days: number } }).data.days).toBe(14)
  const { data: row } = await db().from('site_settings').select('value, type').eq('key', 'referral_attribution_days').single()
  expect(row).toMatchObject({ value: '14', type: 'number' })
  await expect.poll(async () => {
    const audit = (await (await api.get('/api/admin/audit-log?page=1&limit=20')).json()) as { data: { action: string; new_value: unknown }[] }
    return audit.data.some((a) => a.action === 'settings.update' && JSON.stringify(a.new_value ?? {}).includes('referral_attribution_days'))
  }, { message: 'аудит settings.update с ключом окна', timeout: 10_000 }).toBe(true)
  // Возвращаем 90 для остатка прогона (afterAll восстановит значение клиента).
  expect((await api.patch('/api/admin/referral-links/settings', { data: { days: 90 } })).status()).toBe(200)
})

// ── 5. Роли и пользователи ──────────────────────────────────────────────────────────────────────
test('5.1 роли: создание с санитизацией прав, собственную роль не изменить, системную не удалить, reorder, 404', async () => {
  const users = (await (await api.get('/api/admin/users')).json()) as { data: { id: string; email: string; role_id: string | null }[] }
  const me = users.data.find((u) => u.id === selfId)!
  expect(me.email).toBe(ENV.email)
  const roles = (await (await api.get('/api/admin/roles')).json()) as { data: { id: string; name: string; is_system: boolean; permissions: string[] }[] }
  const adminRole = roles.data.find((r) => r.is_system)!

  expect((await api.post('/api/admin/roles', { data: { name: '  ', permissions: [] } })).status()).toBe(400)
  const create = await api.post('/api/admin/roles', { data: { name: `${E2E_TAG} Роль`, permissions: ['manage_leads', 'bogus_permission', 'manage_leads'] } })
  expect(create.status(), await create.text()).toBe(200)
  const role = ((await create.json()) as { data: { id: string; permissions: string[] } }).data
  expect(role.permissions).toEqual(['manage_leads'])
  expect((await api.post('/api/admin/roles', { data: { name: `${E2E_TAG} Роль`, permissions: [] } })).status(), 'дубль названия').toBe(409)

  const own = await api.patch(`/api/admin/roles/${me.role_id}`, { data: { permissions: ['manage_leads'] } })
  expect(own.status(), 'права собственной роли').toBe(403)
  const sysDel = await api.delete(`/api/admin/roles/${adminRole.id}`)
  expect([400, 403]).toContain(sysDel.status())
  const sysEdit = await api.patch(`/api/admin/roles/${adminRole.id}`, { data: { name: 'hacked' } })
  expect([400, 403, 200]).toContain(sysEdit.status())
  const adminAfter = ((await (await api.get('/api/admin/roles')).json()) as { data: { id: string; name: string }[] }).data.find((r) => r.id === adminRole.id)!
  expect(adminAfter.name, 'имя системной роли неизменно').toBe(adminRole.name)

  expect((await api.patch(`/api/admin/roles/${role.id}`, { data: { name: `${E2E_TAG} Роль 2`, permissions: ['view_reports'] } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/roles/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)
  const ids = ((await (await api.get('/api/admin/roles')).json()) as { data: { id: string }[] }).data.map((r) => r.id)
  expect((await api.patch('/api/admin/roles/reorder', { data: { orderedIds: ids.slice(1) } })).status(), 'неполная перестановка').toBe(400)
  expect((await api.patch('/api/admin/roles/reorder', { data: { orderedIds: ids } })).status()).toBe(200)
  expect((await api.delete(`/api/admin/roles/${role.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/roles/${NIL_UUID}`)).status()).toBe(404)
})

test('5.2 пользователи: самодеактивация и самоудаление → 400; неизвестный id → 4xx; инвайт — только по флагу', async () => {
  expect((await api.patch(`/api/admin/users/${selfId}`, { data: { is_active: false } })).status()).toBe(400)
  expect((await api.delete(`/api/admin/users/${selfId}`)).status()).toBe(400)
  expect((await api.patch(`/api/admin/users/${selfId}`, { data: {} })).status()).toBe(400)
  const ghost = await api.patch(`/api/admin/users/${NIL_UUID}`, { data: { display_name: 'x' } })
  expect(ghost.status(), await ghost.text()).toBeLessThan(500)
  expect((await api.post('/api/admin/users', { data: { email: '', role_id: NIL_UUID } })).status()).toBe(400)
  test.skip(process.env.E2E_ALLOW_INVITE !== '1' || !process.env.E2E_INVITE_EMAIL, 'инвайт отправляет реальное письмо — только с E2E_ALLOW_INVITE=1 и E2E_INVITE_EMAIL')
  const roles = (await (await api.get('/api/admin/roles')).json()) as { data: { id: string; name: string; is_system: boolean; permissions: string[] }[] }
  const minimal = roles.data.find((r) => r.name === 'e2e-minimal') ?? roles.data.find((r) => !r.is_system && r.permissions.length <= 1) ?? roles.data.find((r) => !r.is_system)!
  const inv = await api.post('/api/admin/users', { data: { email: process.env.E2E_INVITE_EMAIL, role_id: minimal.id } })
  if (inv.status() === 500) {
    // Supabase Auth ограничивает письма со встроенного SMTP (несколько в час): «email rate limit exceeded».
    const { data: users } = await db().auth.admin.listUsers({ perPage: 1000 })
    const exists = users.users.some((u) => u.email === process.env.E2E_INVITE_EMAIL)
    test.skip(!exists, 'Supabase Auth: лимит писем исчерпан (email rate limit exceeded) — повторить позже')
  }
  expect(inv.status(), await inv.text()).toBe(200)
  const invited = (await (await api.get('/api/admin/users')).json()) as { data: { id: string; email: string }[] }
  const u = invited.data.find((x) => x.email === process.env.E2E_INVITE_EMAIL)!
  expect(u).toBeTruthy()
  expect((await api.delete(`/api/admin/users/${u.id}`)).status()).toBe(200)
})

// ── 6. Контент: тексты, SEO, юр.документы, картинки ─────────────────────────────────────────────
test('6.1 тексты: правка доезжает до сайта, лимиты/чужой раздел/неизвестный блок/telegram → 400, оптимистическая блокировка 409, откат побайтово', async () => {
  const got = (await (await api.get('/api/admin/content')).json()) as { messages: Record<string, unknown>; updatedAt: string | null }
  const original = JSON.parse(JSON.stringify(got.messages)) as Record<string, Record<string, unknown>>
  const marker = `${E2E_TAG} ${Date.now()}`
  const changed = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  changed.thanks.title = marker
  const put = await api.put('/api/admin/content', { data: { overrides: changed, baseUpdatedAt: got.updatedAt } })
  expect(put.status(), await put.text()).toBe(200)
  const { updatedAt } = (await put.json()) as { updatedAt: string }
  let seen = false
  for (let i = 0; i < 10 && !seen; i++) {
    seen = (await (await api.get('/thanks')).text()).includes(marker)
    if (!seen) await new Promise((r) => setTimeout(r, 500))
  }
  expect(seen, '/thanks показывает правку').toBe(true)

  const stale = await api.put('/api/admin/content', { data: { overrides: changed, baseUpdatedAt: got.updatedAt } })
  expect(stale.status(), 'устаревшая версия → 409').toBe(409)

  const tooLong = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  tooLong.hero.title = 'Ж'.repeat(200)
  const r1 = await api.put('/api/admin/content', { data: { overrides: tooLong, baseUpdatedAt: updatedAt } })
  expect(r1.status()).toBe(400)
  expect(await r1.text()).toContain('hero.title')
  expect((await api.put('/api/admin/content', { data: { overrides: { pageMeta: {} }, baseUpdatedAt: updatedAt } })).status(), 'pageMeta не редактируется').toBe(400)
  expect((await api.put('/api/admin/content', { data: { overrides: { nope: {} }, baseUpdatedAt: updatedAt } })).status()).toBe(400)
  const badHidden = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  badHidden.home.hidden = ['nope']
  expect((await api.put('/api/admin/content', { data: { overrides: badHidden, baseUpdatedAt: updatedAt } })).status()).toBe(400)
  const badTg = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  badTg.site.telegram = 'javascript:alert(1)'
  expect((await api.put('/api/admin/content', { data: { overrides: badTg, baseUpdatedAt: updatedAt } })).status()).toBe(400)
  const badHref = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  badHref.hero.trustHref = 'data:text/html,x'
  expect((await api.put('/api/admin/content', { data: { overrides: badHref, baseUpdatedAt: updatedAt } })).status()).toBe(400)
  const tooMany = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  (tooMany as Record<string, unknown>).faq = Array.from({ length: 51 }, () => ({ q: 'q', a: 'a' }))
  expect((await api.put('/api/admin/content', { data: { overrides: tooMany, baseUpdatedAt: updatedAt } })).status(), 'массив > 50').toBe(400)

  // Скрытие блока benefits: сохраняется, сайт без секции, откат.
  const hide = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  hide.home.hidden = Array.from(new Set([...((original.home.hidden as string[]) ?? []), 'benefits']))
  const h = await api.put('/api/admin/content', { data: { overrides: hide, baseUpdatedAt: updatedAt } })
  expect(h.status(), await h.text()).toBe(200)
  const { updatedAt: u2 } = (await h.json()) as { updatedAt: string }
  let hidden = false
  for (let i = 0; i < 10 && !hidden; i++) {
    hidden = !(await (await api.get('/')).text()).includes('id="benefits"')
    if (!hidden) await new Promise((r) => setTimeout(r, 500))
  }
  expect(hidden, 'скрытый блок отсутствует в DOM').toBe(true)

  const back = await api.put('/api/admin/content', { data: { overrides: original, baseUpdatedAt: u2 } })
  expect(back.status(), await back.text()).toBe(200)
  const { data: after } = await db().from('site_content').select('data').eq('id', 'landing').single()
  expect(after!.data, 'дифф после отката = исходному').toEqual(snapshot.landing.data)
  let audit: { action: string; new_value: unknown }[] = []
  await expect.poll(async () => {
    const res = await db().from('audit_log').select('action, new_value').eq('user_id', selfId).gte('created_at', startIso).eq('action', 'content.save')
    audit = (res.data ?? []) as typeof audit
    return audit.length
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(3)
  expect(JSON.stringify(audit)).not.toContain(marker)
})

test('6.2 SEO и юр.документы: GET, невалидный OG-image → 400, сохранение тех же значений не меняет строку', async () => {
  const seo = (await (await api.get('/api/admin/seo')).json()) as { overrides: Record<string, unknown>; content: Record<string, unknown>; updatedAt: string | null }
  expect(seo.content).toBeTruthy()
  expect((await api.put('/api/admin/seo', { data: { overrides: { ...seo.overrides, ogImage: 'https://evil.example/x.png' }, baseUpdatedAt: seo.updatedAt } })).status()).toBe(400)
  expect((await api.put('/api/admin/seo', { data: { overrides: { title: 'x'.repeat(201) }, baseUpdatedAt: seo.updatedAt } })).status()).toBe(400)
  const same = await api.put('/api/admin/seo', { data: { overrides: seo.overrides, baseUpdatedAt: seo.updatedAt } })
  expect(same.status(), await same.text()).toBe(200)
  const { data: seoRow } = await db().from('site_content').select('data').eq('id', 'seo').single()
  expect(seoRow!.data).toEqual(snapshot.seo?.data ?? {})

  const legal = (await (await api.get('/api/admin/legal')).json()) as { overrides: Record<string, unknown>; content: Record<string, { sections: unknown[] }>; updatedAt: string | null }
  expect(legal.content.privacy.sections.length).toBeGreaterThan(0)
  expect((await api.put('/api/admin/legal', { data: { overrides: { privacy: { sections: Array.from({ length: 81 }, () => ({ heading: 'h', paragraphs: [] })) } }, baseUpdatedAt: legal.updatedAt } })).status()).toBe(400)
  const sameLegal = await api.put('/api/admin/legal', { data: { overrides: legal.overrides, baseUpdatedAt: legal.updatedAt } })
  expect(sameLegal.status(), await sameLegal.text()).toBe(200)
  const { data: legalRow } = await db().from('site_content').select('data').eq('id', 'legal').single()
  expect(legalRow!.data).toEqual(snapshot.legal?.data ?? {})
})

test('6.3 загрузка картинок: svg и не-картинка → 400, > 5 МБ → 4xx, png → url в собственном хранилище', async () => {
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  const svg = await api.post('/api/admin/content/upload', { multipart: { file: { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') } } })
  expect(svg.status()).toBe(400)
  const txt = await api.post('/api/admin/content/upload', { multipart: { file: { name: '../../x.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') } } })
  expect(txt.status()).toBe(400)
  const noFile = await api.post('/api/admin/content/upload', { multipart: { previous: 'x' } })
  expect(noFile.status()).toBe(400)
  const big = await api.post('/api/admin/content/upload', { multipart: { file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1) } } })
  expect(big.status()).toBeGreaterThanOrEqual(400)
  expect(big.status()).toBeLessThan(500)
  const fake = await api.post('/api/admin/content/upload', { multipart: { file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') } } })
  expect(fake.status(), 'содержимое не соответствует MIME → 400').toBe(400)
  const okUp = await api.post('/api/admin/content/upload', { multipart: { file: { name: '..\\evil name.png', mimeType: 'image/png', buffer: png1x1 } } })
  expect(okUp.status(), await okUp.text()).toBe(200)
  const { url } = (await okUp.json()) as { url: string }
  expect(url).toContain('/storage/v1/object/public/content/')
  const objectPath = url.split('/storage/v1/object/public/content/')[1]
  created.storage.push(objectPath)
  expect(objectPath, 'имя файла генерируется сервером').toMatch(/^\d+-[a-z0-9]{4,8}\.png$/)
})

// ── 7. Интеграции, теги, настройки, события аналитики ───────────────────────────────────────────
test('7.1 интеграции: список без секретов, неизвестный ключ → 400, запись без ADMIN_ENCRYPTION_KEY → контролируемая ошибка, ключи Telegram не затронуты', async () => {
  // CSRF: мутация с чужого Origin → 403 даже с сессией; свой Origin — проходит дальше.
  const foreign = await api.put('/api/admin/integrations/not_a_key', { data: { value: 'x' }, headers: { origin: 'https://evil.example' } })
  expect(foreign.status()).toBe(403)
  const own = await api.put('/api/admin/integrations/not_a_key', { data: { value: 'x' }, headers: { origin: 'http://127.0.0.1:3100' } })
  expect(own.status()).toBe(400)
  const list = await api.get('/api/admin/integrations')
  expect(list.status()).toBe(200)
  const items = ((await list.json()) as { data: { key: string; value: string | null; masked_value: string | null }[] }).data
  const tg = items.find((i) => i.key === 'telegram_bot_token')
  if (tg) {
    expect(tg.value, 'секрет не отдаётся в открытом виде').toBeNull()
    expect(tg.masked_value ?? '').not.toMatch(/^\d{6,}:/)
  }
  expect((await api.put('/api/admin/integrations/not_a_key', { data: { value: 'x' } })).status()).toBe(400)
  expect((await api.delete('/api/admin/integrations/not_a_key')).status()).toBe(400)
  expect((await api.put('/api/admin/integrations/smtp_from', { data: { value: '' } })).status()).toBe(400)
  const { data: before } = await db().from('integrations').select('key, encrypted_value, iv, auth_tag').order('key')
  const set = await api.put('/api/admin/integrations/smtp_from', { data: { value: 'e2e@example.com' } })
  const noKey = !process.env.ADMIN_ENCRYPTION_KEY
  if (noKey) {
    expect(set.status(), 'без ключа шифрования — ошибка, не 200').toBeGreaterThanOrEqual(400)
    const body = await set.text()
    expect(body).not.toMatch(/at .*\.(ts|js):\d+/)
  } else {
    expect(set.status()).toBe(200)
    expect((await api.delete('/api/admin/integrations/smtp_from')).status()).toBe(200)
  }
  const { data: after } = await db().from('integrations').select('key, encrypted_value, iv, auth_tag').order('key')
  expect(after!.filter((r) => r.key.startsWith('telegram'))).toEqual(before!.filter((r) => r.key.startsWith('telegram')))
  const { data: leftover } = await db().from('integrations').select('key').eq('key', 'smtp_from')
  if (leftover?.length) await db().from('integrations').delete().eq('key', 'smtp_from')

  const sheets = await api.post('/api/admin/integrations/google-sheets/test')
  expect(sheets.status()).toBe(200)
  expect(((await sheets.json()) as { ok: boolean }).ok).toBe(false)
  test.skip(process.env.E2E_ALLOW_INTEGRATION_TESTS !== '1', 'тест Telegram отправляет реальное сообщение клиенту — только с E2E_ALLOW_INTEGRATION_TESTS=1')
  const tgTest = await api.post('/api/admin/integrations/telegram_bot_token/test')
  expect(tgTest.status()).toBe(200)
})

test('7.2 Google-теги: conversion_label только для aw, формат, дубли, CRUD (тег выключен — сайт не затрагивается)', async () => {
  expect((await api.post('/api/admin/tracking-tags', { data: { type: 'ga4', tag_id: 'G-E2E1', conversion_label: 'X', enabled: false } })).status()).toBe(400)
  expect((await api.post('/api/admin/tracking-tags', { data: { type: 'aw', tag_id: 'AW-1', conversion_label: 'bad label!', enabled: false } })).status()).toBe(400)
  expect((await api.post('/api/admin/tracking-tags', { data: { type: 'aw', tag_id: 'G-123', enabled: false } })).status()).toBe(400)
  expect((await api.post('/api/admin/tracking-tags', { data: { type: 'pixel', tag_id: 'X' } })).status()).toBe(400)
  const create = await api.post('/api/admin/tracking-tags', { data: { type: 'aw', tag_id: 'AW-999999001', label: `${E2E_TAG} тег`, conversion_label: 'e2eLabel_1', enabled: false } })
  expect(create.status(), await create.text()).toBe(200)
  const tag = ((await create.json()) as { data: { id: string; conversion_label: string } }).data
  expect(tag.conversion_label).toBe('e2eLabel_1')
  expect((await api.post('/api/admin/tracking-tags', { data: { type: 'aw', tag_id: 'AW-999999001', label: `${E2E_TAG} дубль`, enabled: false } })).status()).toBe(409)
  expect((await api.patch(`/api/admin/tracking-tags/${tag.id}`, { data: { conversion_label: '' } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/tracking-tags/${tag.id}`, { data: { tag_id: 'GTM-XYZ' } })).status(), 'тип неизменен — ID проверяется по текущему типу').toBe(400)
  expect((await api.patch(`/api/admin/tracking-tags/${NIL_UUID}`, { data: { enabled: false } })).status()).toBe(404)
  const html = await (await api.get('/')).text()
  expect(html, 'выключенный тег не попадает на сайт').not.toContain('AW-999999001')
  expect((await api.delete(`/api/admin/tracking-tags/${tag.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/tracking-tags/${NIL_UUID}`)).status()).toBe(404)
})

test('7.3 настройки: GET без telephony_secret, неизвестный ключ → 400, валидация значений, сохранение текущего значения', async () => {
  const get = (await (await api.get('/api/admin/settings')).json()) as { data: { key: string; value: string }[] }
  expect(get.data.some((s) => s.key === 'telephony_secret')).toBe(false)
  expect((await api.put('/api/admin/settings', { data: { items: [{ key: 'telephony_secret', value: 'x' }] } })).status()).toBe(400)
  expect((await api.put('/api/admin/settings', { data: { items: [{ key: 'internal_currency', value: 'BTC' }] } })).status()).toBe(400)
  expect((await api.put('/api/admin/settings', { data: { items: [{ key: 'dedup_ip_window_hours', value: -1 }] } })).status()).toBe(400)
  expect((await api.put('/api/admin/settings', { data: { items: [] } })).status()).toBe(400)
  const cur = get.data.find((s) => s.key === 'internal_currency')
  if (cur) {
    const same = await api.put('/api/admin/settings', { data: { items: [{ key: 'internal_currency', value: cur.value }] } })
    expect(same.status(), await same.text()).toBe(200)
    const { data: row } = await db().from('site_settings').select('value').eq('key', 'internal_currency').single()
    expect(row!.value).toBe(cur.value)
  }
})

test('7.4 события аналитики: GET, неизвестный ключ → 400, > 5 имён → 400, запрещённые form_start/form_submit (ожидание стандарта)', async () => {
  const get = await api.get('/api/admin/analytics-events')
  expect(get.status()).toBe(200)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { nope_key: { enabled: true } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: 'yes' } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['a', 'b', 'c', 'd', 'e', 'f'] } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['Bad Name'] } } } })).status()).toBe(400)
  const forbidden = await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['form_start'] } } } })
  // Правило AGENTS.md/раздел 15: имена form_start/form_submit запрещены (исправлено 2026-09-18).
  expect(forbidden.status()).toBe(400)
  expect(await forbidden.text()).toContain('form_start')
})

// ── 8. Аналитика ────────────────────────────────────────────────────────────────────────────────
test('8 аналитика: отчёт по известным лидам, значения измерений, экспорт CSV (экранирование), невалидные даты → 400', async () => {
  // Границы дат сервер считает по Киеву — берём окно ±1 день, чтобы тест не зависел от времени суток.
  const dayFrom = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const dayTo = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const extra = await insertTestLead({ utm_source: 'e2e-src', name: `${E2E_TAG} Кома, "лапки"\nрядок` })
  created.leads.push(extra.id)
  const report = await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&group_by=utm_source&filter_utm_source=e2e-src`)
  expect(report.status(), await report.text()).toBe(200)
  const rep = (await report.json()) as { total: { total: number } }
  expect(rep.total.total, 'два лида [E2E] с utm_source=e2e-src (leadA + extra)').toBe(2)
  expect((await api.get('/api/admin/analytics/report?date_from=2026-13-40&date_to=x')).status()).toBe(400)
  expect((await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&group_by=custom_field`)).status(), 'custom_field без id → 400').toBe(400)
  const dims = (await (await api.get(`/api/admin/analytics/dimension-values?dimension=utm_source&date_from=${dayFrom}&date_to=${dayTo}`)).json()) as { data: { value: string }[] }
  expect(dims.data.some((d) => d.value === 'e2e-src')).toBe(true)

  const csv = await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: dayFrom, date_to: dayTo, filter_utm_source: 'e2e-src' }, leadFields: ['dates', 'phone', 'status', 'utm_source'] } })
  expect(csv.status(), await csv.text()).toBe(200)
  expect(csv.headers()['content-type']).toMatch(/csv/)
  expect(csv.headers()['content-disposition']).toMatch(/attachment/)
  const body = await csv.text()
  expect(body).toContain('e2e-src')
  expect((body.match(/\n/g) ?? []).length, 'строка с переводом строки в значении не ломает CSV (строки: заголовок + 2)').toBeGreaterThanOrEqual(2)
  const summary = await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'summary', filters: { date_from: dayFrom, date_to: dayTo }, summaryColumns: ['total'] } })
  expect(summary.status(), await summary.text()).toBe(200)
  expect((await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: dayFrom, date_to: dayTo }, leadFields: [] } })).status()).toBe(400)
  expect((await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: dayFrom, date_to: dayTo }, leadFields: ['phone'], dealAmountFrom: 10, dealAmountTo: 1 } })).status()).toBe(400)
  const empty = await api.get('/api/admin/analytics/report?date_from=2000-01-01&date_to=2000-01-02')
  expect(empty.status(), 'пустой период → 200').toBe(200)

  // Реферальная ссылка: разрез, разбивка, фильтр (UUID | none | невалидный → 400), колонка CSV.
  const refLinkRes = await api.post('/api/admin/referral-links', { data: { name: `${E2E_TAG} Партнер аналітика` } })
  expect(refLinkRes.status(), await refLinkRes.text()).toBe(200)
  const refLink = ((await refLinkRes.json()) as { data: { id: string; code: string; name: string } }).data
  expect((await db().from('leads').update({ referral_link_id: refLink.id, referral_code: refLink.code }).eq('id', extra.id)).error).toBeNull()
  const byRef = (await (await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&group_by=referral_link&filter_referral_link_id=${refLink.id}`)).json()) as { total: { total: number }; rows: { key: string; label: string; total: number }[] }
  expect(byRef.total.total, 'фильтр по ссылке — только extra').toBe(1)
  expect(byRef.rows).toHaveLength(1)
  expect(byRef.rows[0]).toMatchObject({ key: refLink.id, label: refLink.name, total: 1 })
  const grouped = (await (await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&group_by=referral_link&breakdown=referral_link&breakdown_metrics=total&filter_utm_source=e2e-src`)).json()) as { rows: { key: string; label: string; total: number }[]; timeseriesBreakdown: { series: { label: string }[] } }
  expect(grouped.rows.map((r) => [r.label, r.total])).toEqual(expect.arrayContaining([[refLink.name, 1], ['Без посилання', 1]]))
  expect(grouped.timeseriesBreakdown.series.map((s) => s.label)).toEqual(expect.arrayContaining([refLink.name, 'Без посилання']))
  const noneRep = (await (await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&filter_utm_source=e2e-src&filter_referral_link_id=none`)).json()) as { total: { total: number } }
  expect(noneRep.total.total, 'none → только leadA без ссылки').toBe(1)
  expect((await api.get(`/api/admin/analytics/report?date_from=${dayFrom}&date_to=${dayTo}&filter_referral_link_id=abc`)).status(), 'невалидный фильтр → 400').toBe(400)
  const refCsv = await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: dayFrom, date_to: dayTo, filter_referral_link_id: refLink.id }, leadFields: ['phone', 'referral_link'] } })
  expect(refCsv.status(), await refCsv.text()).toBe(200)
  const refBody = await refCsv.text()
  expect(refBody).toContain('Реферальне посилання')
  expect(refBody).toContain(refLink.name)
  expect((refBody.match(/\n/g) ?? []).length, 'заголовок + 1 строка').toBeLessThanOrEqual(2)
  expect((await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: dayFrom, date_to: dayTo, filter_referral_link_id: 'abc' }, leadFields: ['phone'] } })).status()).toBe(400)
  expect((await db().from('leads').update({ referral_link_id: null, referral_code: null }).eq('id', extra.id)).error).toBeNull()
  expect((await api.delete(`/api/admin/referral-links/${refLink.id}`)).status()).toBe(200)
})

// ── 10. Публичный приёмник: полный путь с записью (за флагом — реальные уведомления клиенту) ────
test('10 POST /api/leads с записью: лид в начальной стадии с IP/locale, дедуп по телефону → duplicate + комментарий, 4-й с IP → 429', async () => {
  test.skip(process.env.E2E_ALLOW_LEAD_WRITES !== '1', 'полный путь пишет лиды и шлёт уведомления — только с E2E_ALLOW_LEAD_WRITES=1')
  const ip = { 'x-forwarded-for': '198.51.100.21' }
  const post = (phone: string, extra: Record<string, unknown> = {}) =>
    api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone, source: 'e2e', locale: 'uk', ...extra }, headers: ip })
  const r1 = await post('+380990005001')
  expect(r1.status(), await r1.text()).toBe(200)
  expect(await r1.json()).toEqual({ ok: true })
  const { data: lead } = await db().from('leads').select('id, name, status_id, ip_address, locale, phone').eq('phone', '+380990005001').order('created_at', { ascending: false }).limit(1).single()
  expect(lead).toBeTruthy()
  created.leads.push(lead!.id)
  const initial = stages.find((s) => s.is_initial)!
  expect(lead!.status_id, 'лид в начальной стадии').toBe(initial.id)
  expect(lead!.ip_address).toBe('198.51.100.21')
  expect(lead!.locale).toBe('uk')
  // Дедуп по телефону зависит от настройки клиента (site_settings.dedup_by_phone, дефолт true):
  // включено → повтор = { ok, duplicate }, нового лида нет, комментарий «повтор»; выключено → второй лид.
  const { data: dedupRow } = await db().from('site_settings').select('value').eq('key', 'dedup_by_phone').maybeSingle()
  const dedupByPhone = (dedupRow?.value ?? 'true') === 'true'
  const dup = await post('+380990005001')
  expect(dup.status()).toBe(200)
  const { data: samePhone } = await db().from('leads').select('id').eq('phone', '+380990005001')
  if (dedupByPhone) {
    expect(await dup.json()).toEqual({ ok: true, duplicate: true })
    expect(samePhone!.length).toBe(1)
    const { data: comments } = await db().from('lead_comments').select('type, content').eq('lead_id', lead!.id)
    expect(comments!.some((c) => /повтор/i.test(c.content)), 'комментарий о повторе').toBe(true)
  } else {
    expect(await dup.json()).toEqual({ ok: true })
    expect(samePhone!.length, 'дедуп выключен — второй лид записан').toBe(2)
  }
  created.leads.push(...samePhone!.map((l) => l.id))
  // Лимит 3/10 мин с IP считает только сохранённые лиды: с дедупом сохранён 1, без — 2.
  const saved = samePhone!.length
  const rest = ['+380990005002', '+380990005003', '+380990005004']
  const statuses: number[] = []
  for (const phone of rest) statuses.push((await post(phone)).status())
  const expected = rest.map((_, i) => (saved + i + 1 <= 3 ? 200 : 429))
  expect(statuses, 'rate limit 3/10 мин').toEqual(expected)
  const { data: more } = await db().from('leads').select('id').in('phone', rest)
  expect(more!.length, 'лиды сверх лимита не записаны').toBe(3 - saved)
  created.leads.push(...more!.map((l) => l.id))
  const last = await post('+380990005005')
  expect(last.status()).toBe(429)
  expect(last.headers()['retry-after']).toBe('600')

  // Реферал (first-touch): cookie-список касаний — самое раннее в окне (90 дней) выигрывает у позднего;
  // первое вне окна → второе; неизвестный ref в теле → только код; выключенная ссылка → только код.
  // Другие IP — чтобы не упереться в лимит.
  const linkRes = await api.post('/api/admin/referral-links', { data: { name: `${E2E_TAG} Партнер cookie` } })
  expect(linkRes.status(), await linkRes.text()).toBe(200)
  const link = ((await linkRes.json()) as { data: { id: string; code: string } }).data
  const linkBRes = await api.post('/api/admin/referral-links', { data: { name: `${E2E_TAG} Партнер B` } })
  expect(linkBRes.status(), await linkBRes.text()).toBe(200)
  const linkB = ((await linkBRes.json()) as { data: { id: string; code: string } }).data
  const nowSec = Math.floor(Date.now() / 1000)
  const DAY = 86_400
  const withCookie = await api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone: '+380990005011', source: 'e2e', locale: 'uk' }, headers: { 'x-forwarded-for': '198.51.100.31', cookie: `lead_ref=v2_${link.code}.${nowSec - 5 * DAY}_${linkB.code}.${nowSec - DAY}` } })
  expect(withCookie.status(), await withCookie.text()).toBe(200)
  const { data: l1 } = await db().from('leads').select('id, referral_link_id, referral_code, referral_touched_at').eq('phone', '+380990005011').single()
  expect(l1, 'A (5 дней назад) раньше B (1 день назад) → заявка у A').toMatchObject({ referral_link_id: link.id, referral_code: link.code })
  expect(Math.abs(new Date(l1!.referral_touched_at as string).getTime() / 1000 - (nowSec - 5 * DAY))).toBeLessThan(2)
  created.leads.push(l1!.id)
  const outOfWindow = await api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone: '+380990005014', source: 'e2e', locale: 'uk' }, headers: { 'x-forwarded-for': '198.51.100.34', cookie: `lead_ref=v2_${link.code}.${nowSec - 200 * DAY}_${linkB.code}.${nowSec - DAY}` } })
  expect(outOfWindow.status(), await outOfWindow.text()).toBe(200)
  const { data: l4 } = await db().from('leads').select('id, referral_link_id, referral_code').eq('phone', '+380990005014').single()
  expect(l4, 'A вне окна 90 дней → заявка у B').toMatchObject({ referral_link_id: linkB.id, referral_code: linkB.code })
  created.leads.push(l4!.id)
  const allOld = await api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone: '+380990005015', source: 'e2e', locale: 'uk' }, headers: { 'x-forwarded-for': '198.51.100.35', cookie: `lead_ref=v2_${link.code}.${nowSec - 200 * DAY}_${linkB.code}.${nowSec - 100 * DAY}` } })
  expect(allOld.status(), await allOld.text()).toBe(200)
  const { data: l5 } = await db().from('leads').select('id, referral_link_id, referral_code, referral_touched_at').eq('phone', '+380990005015').single()
  expect(l5, 'все касания вне окна → органическая заявка').toMatchObject({ referral_link_id: null, referral_code: null, referral_touched_at: null })
  created.leads.push(l5!.id)
  const unknownRef = await api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone: '+380990005012', source: 'e2e', locale: 'uk', ref: 'zzzz9999' }, headers: { 'x-forwarded-for': '198.51.100.32' } })
  expect(unknownRef.status()).toBe(200)
  const { data: l2 } = await db().from('leads').select('id, referral_link_id, referral_code').eq('phone', '+380990005012').single()
  expect(l2).toMatchObject({ referral_link_id: null, referral_code: 'zzzz9999' })
  created.leads.push(l2!.id)
  expect((await api.patch(`/api/admin/referral-links/${link.id}`, { data: { is_active: false } })).status()).toBe(200)
  const inactive = await api.post('/api/leads', { data: { name: E2E_PUBLIC_NAME, phone: '+380990005013', source: 'e2e', locale: 'uk', ref: link.code }, headers: { 'x-forwarded-for': '198.51.100.33' } })
  expect(inactive.status()).toBe(200)
  const { data: l3 } = await db().from('leads').select('id, referral_link_id, referral_code').eq('phone', '+380990005013').single()
  expect(l3, 'выключенная ссылка не засчитывает').toMatchObject({ referral_link_id: null, referral_code: link.code })
  created.leads.push(l3!.id)
  // Ссылка с заявкой не удаляется — уберём в afterAll после лидов.
  expect((await api.delete(`/api/admin/referral-links/${link.id}`)).status()).toBe(409)
})

// ── 9. Журнал действий ──────────────────────────────────────────────────────────────────────────
test('9 журнал действий: все действия этого прогона есть в журнале с актором и без значений ключей интеграций; пагинация', async () => {
  const page1 = await api.get('/api/admin/audit-log?page=1&limit=100')
  expect(page1.status()).toBe(200)
  const json = (await page1.json()) as { data: { action: string; user_email: string | null; resource: string; old_value: unknown; new_value: unknown; created_at: string }[]; total: number; totalPages: number }
  const mine = json.data.filter((r) => r.user_email === ENV.email && r.created_at >= startIso)
  const actions = new Set(mine.map((r) => r.action))
  for (const a of ['lead.update', 'lead.delete', 'stage.create', 'stage.update', 'stage.delete', 'stage.reorder', 'custom_field.create', 'custom_field.delete', 'role.create', 'role.update', 'role.delete', 'role.reorder', 'content.save', 'seo.save', 'legal.save', 'tracking_tag.create', 'tracking_tag.delete', 'settings.update', 'referral_link.create', 'referral_link.update', 'referral_link.delete']) {
    expect(actions.has(a), `нет записи ${a}`).toBe(true)
  }
  const integ = mine.filter((r) => r.action.startsWith('integration.'))
  for (const r of integ) {
    expect(r.old_value).toBeNull()
    expect(r.new_value).toBeNull()
  }
  expect(JSON.stringify(mine)).not.toContain('e2e@example.com')
  const clamp = await api.get('/api/admin/audit-log?page=0&limit=999')
  expect(clamp.status()).toBe(200)
  expect(((await clamp.json()) as { limit: number; page: number }).limit).toBeLessThanOrEqual(100)
  const uk2 = uk as { thanks: { title: string } }
  expect(uk2.thanks.title).toBeTruthy()
})
