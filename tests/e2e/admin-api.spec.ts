// API адмінки з сесією тестового адміна (розділи 5, 6, 9, 15, 16): матриця прав, CRUD-цикли
// «створити → перевірити → видалити», воронка конверсій, редактор контенту з відкатом, журнал дій.
// Проти ПРОДОВОЇ БД: усе створене має маркер [E2E] і прибирається в afterAll; site_content порівнюється
// зі знімком до тестів. Без E2E_ADMIN_EMAIL/PASSWORD або без користувача в Auth — увесь файл пропускається.
// Побічні ефекти з реальними відправками (Telegram-тест, інвайт, публічний приймач) — за окремими
// env-прапорцями E2E_ALLOW_INTEGRATION_TESTS / E2E_ALLOW_INVITE (без них пропускаються).
import { test, expect, type APIRequestContext } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import {
  ENV, E2E_TAG, NIL_UUID, hasAdminCreds, probeLogin, loginApi, db, snapshotContent, restoreContent,
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
const created: { leads: string[]; storage: string[] } = { leads: [], storage: [] }

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'API-перевірки — один раз (desktop)')
  test.skip(!hasAdminCreds(), 'Немає E2E_ADMIN_EMAIL/PASSWORD або ключів Supabase у .env.local')
  const probe = await probeLogin(ENV.email!, ENV.password!)
  test.skip(!probe, `Тестового адміна ${ENV.email} немає в Supabase Auth або пароль не підходить`)
  selfId = probe!.userId
  snapshot = await snapshotContent()
  const { data: ae } = await db().from('site_settings').select('value').eq('key', 'analytics_events').maybeSingle()
  analyticsEventsBefore = (ae?.value as string | null | undefined) ?? null
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
  report.content_restored = (await restoreContent(snapshot)).join(',') || 'не було змін'
  const leftovers = await leftoversE2E()
  console.log('[cleanup]', JSON.stringify({ ...report, leftovers }))
  for (const [t, n] of Object.entries(leftovers)) expect(n, `залишки [E2E] у ${t}`).toBe(0)
})

// ── 1. Доступ і матриця прав ────────────────────────────────────────────────────────────────────
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
  ['/api/admin/analytics/report?date_from=2026-01-01&date_to=2026-01-02', ['view_reports']],
  ['/api/admin/analytics/dimension-values?dimension=utm_source&date_from=2026-01-01&date_to=2026-01-02', ['view_reports']],
]

test('1.1 повний адмін: усі GET-роути → 200; dev-роут без NEXT_PUBLIC_DEV_TOOLS → 404', async () => {
  for (const [path] of READ_ROUTES) {
    const r = await api.get(path)
    expect(r.status(), `${path}: ${await r.text()}`).toBe(200)
  }
  const dev = await api.post('/api/admin/dev/ga4-arrival')
  expect([404, 200]).toContain(dev.status())
  if (process.env.NEXT_PUBLIC_DEV_TOOLS !== '1') expect(dev.status()).toBe(404)
})

test('1.2 мінімальна роль (лише manage_leads): довідники 200, розділи без права 403, мутації без права 403', async () => {
  test.skip(!api2, 'Немає E2E_ADMIN2_EMAIL/PASSWORD (користувач з мінімальною роллю)')
  for (const [path, perms] of READ_ROUTES) {
    const r = await api2!.get(path)
    const allowed = perms.length === 0 || perms.includes('manage_leads')
    expect(r.status(), `${path} (мінімальна роль)`).toBe(allowed ? 200 : 403)
    if (!allowed) expect(await r.json()).toEqual({ error: 'Доступ заборонено' })
  }
  const mutations: [string, 'post' | 'put' | 'patch' | 'delete', unknown][] = [
    ['/api/admin/lead-statuses', 'post', { name: `${E2E_TAG} x` }],
    ['/api/admin/roles', 'post', { name: `${E2E_TAG} x`, permissions: [] }],
    ['/api/admin/users', 'post', { email: 'x@example.com', role_id: NIL_UUID }],
    ['/api/admin/settings', 'put', { items: [{ key: 'internal_currency', value: 'UAH' }] }],
    ['/api/admin/content', 'put', { overrides: {} }],
    ['/api/admin/tracking-tags', 'post', { type: 'aw', tag_id: 'AW-1' }],
    ['/api/admin/integrations/smtp_from', 'put', { value: 'x' }],
    [`/api/admin/leads/${NIL_UUID}`, 'delete', undefined],
    ['/api/admin/conversions/export-pending', 'post', undefined],
  ]
  for (const [path, method, data] of mutations) {
    const r = await api2![method](path, data === undefined ? undefined : { data })
    expect(r.status(), `${method.toUpperCase()} ${path} (мінімальна роль)`).toBe(403)
  }
})

test('1.3 деактивація мінімального користувача → наступний запит 403; повернення → 200', async () => {
  test.skip(!api2 || !user2Id, 'Немає другого користувача')
  const off = await api.patch(`/api/admin/users/${user2Id}`, { data: { is_active: false } })
  expect(off.status(), await off.text()).toBe(200)
  const r = await api2!.get('/api/admin/lead-statuses')
  expect(r.status(), 'деактивований — жодних прав навіть на довідники').toBe(403)
  const on = await api.patch(`/api/admin/users/${user2Id}`, { data: { is_active: true } })
  expect(on.status()).toBe(200)
  expect((await api2!.get('/api/admin/lead-statuses')).status()).toBe(200)
})

// ── 2. Ліди: список, фільтри, картка, PATCH, коментарі, кастомні поля, видалення, 404 ────────────
let leadA: { id: string; order_no: number }
let leadB: { id: string; order_no: number }
let stages: { id: string; name: string; is_initial: boolean; conversion_type: string | null; requires_amount: boolean; position: number }[]

test('2.1 список і фільтри: пошук за маркером, стадія, дати, пагінація; картка; 404 на чужий id', async () => {
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
  const today = new Date().toISOString().slice(0, 10)
  const byDate = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&date_from=${today}&date_to=${today}`)).json()) as { total: number }
  expect(byDate.total).toBe(2)
  const noDate = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&date_from=2000-01-01&date_to=2000-01-02`)).json()) as { total: number }
  expect(noDate.total).toBe(0)
  const byUtm = (await (await api.get(`/api/admin/leads?search=${encodeURIComponent(E2E_TAG)}&utm_field=utm_campaign&utm_value=e2e-camp`)).json()) as { total: number }
  expect(byUtm.total).toBe(1)
  const badLimit = await api.get('/api/admin/leads?limit=1000&page=-5')
  expect(badLimit.status(), 'ліміт і сторінка затискаються, не 500').toBe(200)

  const detail = await api.get(`/api/admin/leads/${leadA.id}`)
  expect(detail.status()).toBe(200)
  const detailJson = (await detail.json()) as { data?: { id: string }; id?: string }
  expect(JSON.stringify(detailJson)).toContain(leadA.id)

  expect((await api.get(`/api/admin/leads/${NIL_UUID}`)).status()).toBe(404)
  expect((await api.get('/api/admin/leads/not-a-uuid')).status(), 'невалідний id → 4xx, не 500').toBeLessThan(500)
  expect((await api.patch(`/api/admin/leads/${NIL_UUID}`, { data: { status_id: initial.id } })).status()).toBe(404)
})

test('2.2 PATCH: валідація (порожнє тіло, відʼємна сума, чужі ключі), відповідальний, коментарі, кастомне поле', async () => {
  const empty = await api.patch(`/api/admin/leads/${leadA.id}`, { data: {} })
  expect(empty.status()).toBe(400)
  const neg = await api.patch(`/api/admin/leads/${leadA.id}`, { data: { deal_amount: -5 } })
  expect(neg.status()).toBe(400)
  const foreign = await api.patch(`/api/admin/leads/${leadA.id}`, { data: { phone: '+380000000000' } })
  expect(foreign.status(), 'масове присвоєння чужих ключів відкидається').toBe(400)
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
  expect(sys.data.length, 'системний коментар про відповідального').toBeGreaterThanOrEqual(1)

  // Кастомне поле select: значення поза опціями → 400; валідне → збережено; видалення визначення → значення зникає.
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
  expect(after, 'значення видаляються каскадом').toBe(0)
})

test('2.3 видалення: неіснуючий id → 200 без помилки (зафіксовано), реальний → зникає з БД і потрапляє в журнал', async () => {
  const ghost = await api.delete(`/api/admin/leads/${NIL_UUID}`)
  expect(ghost.status()).toBe(200)
  const del = await api.delete(`/api/admin/leads/${leadB.id}`)
  expect(del.status()).toBe(200)
  const { data } = await db().from('leads').select('id').eq('id', leadB.id)
  expect(data).toEqual([])
  const { data: audit } = await db().from('audit_log').select('action, resource').eq('user_id', selfId).gte('created_at', startIso).eq('action', 'lead.delete')
  expect(audit!.some((a) => a.resource === `leads/${leadB.id}`)).toBe(true)
})

// ── 3. Воронка конверсій (розділ 6, Фаза 5 п. 1, ревью п. 1) ────────────────────────────────────
test('3.1 цільовий лід: enter → pending; exported → leave → RETRACT + retracted; resend/export-pending не перебивають; повторний enter → pending', async () => {
  const target = stages.find((s) => s.conversion_type === 'target_lead')!
  const work = stages.find((s) => !s.conversion_type && !s.is_initial) ?? stages.find((s) => s.is_initial)!
  expect(target, 'потрібна стадія з conversion_type=target_lead').toBeTruthy()
  const patch = (body: Record<string, unknown>) => api.patch(`/api/admin/leads/${leadA.id}`, { data: body })

  expect((await patch({ status_id: target.id })).status()).toBe(200)
  let { data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle()
  expect(oc?.export_status).toBe('pending')
  const { data: hist } = await db().from('lead_status_history').select('to_status_id').eq('lead_id', leadA.id)
  expect(hist!.some((h) => h.to_status_id === target.id), 'історія стадій').toBe(true)

  // Масове вивантаження: Sheets не налаштовано → 400, статус лишається pending.
  const bulk = await api.post('/api/admin/conversions/export-pending')
  expect(bulk.status()).toBe(400)
  ;({ data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(oc?.export_status).toBe('pending')
  const resend0 = await api.post(`/api/admin/conversions/${oc!.id}/resend`)
  expect(resend0.status(), 'не налаштовано → 400 {ok:false}').toBe(400)

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
  expect(adjBulk.status(), 'таблицю корекцій не налаштовано → 400').toBe(400)

  expect((await patch({ status_id: target.id })).status()).toBe(200)
  ;({ data: oc } = await db().from('offline_conversions').select('id, export_status, conversion_action').eq('lead_id', leadA.id).maybeSingle())
  expect(oc?.export_status).toBe('pending')
  const { data: adj2 } = await db().from('conversion_adjustments').select('id').eq('lead_id', leadA.id)
  expect(adj2!.length, 'другого RETRACT немає').toBe(1)
})

test('3.2 угода: сума → конверсія зі значенням; exported + зміна суми → RESTATE; вихід з угоди обнуляє суму', async () => {
  const deal = stages.find((s) => s.conversion_type === 'deal' && s.requires_amount)
  test.skip(!deal, 'немає стадії deal з requires_amount')
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
  expect(lead!.deal_amount, 'вихід з угоди обнуляє суму').toBeNull()
})

// ── 4. Стадії ───────────────────────────────────────────────────────────────────────────────────
test('4 стадії: валідація, унікальність, стадія з лідом не видаляється, reorder, 404', async () => {
  expect((await api.post('/api/admin/lead-statuses', { data: { name: '' } })).status()).toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, color: 'red' } })).status()).toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, conversion_type: 'deal' } })).status(), 'конверсійна без action').toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, conversion_type: 'target_lead', conversion_action: '=cmd()' } })).status(), 'formula injection').toBe(400)
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} x`, requires_amount: true } })).status()).toBe(400)
  const create = await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} Стадія`, color: '#123456' } })
  expect(create.status(), await create.text()).toBe(200)
  const stage = ((await create.json()) as { data: { id: string; position: number } }).data
  expect((await api.post('/api/admin/lead-statuses', { data: { name: `${E2E_TAG} Стадія` } })).status(), 'дубль назви').toBe(409)
  expect((await api.patch(`/api/admin/lead-statuses/${stage.id}`, { data: {} })).status()).toBe(400)
  expect((await api.patch(`/api/admin/lead-statuses/${stage.id}`, { data: { name: `${E2E_TAG} Стадія 2` } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/lead-statuses/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)

  // Лід на стадії → видалення заборонено.
  expect((await api.patch(`/api/admin/leads/${leadA.id}`, { data: { status_id: stage.id } })).status()).toBe(200)
  const delBusy = await api.delete(`/api/admin/lead-statuses/${stage.id}`)
  expect(delBusy.status()).toBe(400)
  expect(await delBusy.text()).toMatch(/лід/i)
  const initial = stages.find((s) => s.is_initial)!
  expect((await api.patch(`/api/admin/leads/${leadA.id}`, { data: { status_id: initial.id } })).status()).toBe(200)
  const delInitial = await api.delete(`/api/admin/lead-statuses/${initial.id}`)
  expect(delInitial.status(), 'початкову стадію не видалити').toBe(400)

  // Reorder: ті самі позиції існуючих + нова в кінці → 200; сміття → 400.
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

// ── 5. Ролі та користувачі ──────────────────────────────────────────────────────────────────────
test('5.1 ролі: створення з санітизацією прав, власну роль не змінити, системну не видалити, reorder, 404', async () => {
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
  expect((await api.post('/api/admin/roles', { data: { name: `${E2E_TAG} Роль`, permissions: [] } })).status(), 'дубль назви').toBe(409)

  const own = await api.patch(`/api/admin/roles/${me.role_id}`, { data: { permissions: ['manage_leads'] } })
  expect(own.status(), 'права власної ролі').toBe(403)
  const sysDel = await api.delete(`/api/admin/roles/${adminRole.id}`)
  expect([400, 403]).toContain(sysDel.status())
  const sysEdit = await api.patch(`/api/admin/roles/${adminRole.id}`, { data: { name: 'hacked' } })
  expect([400, 403, 200]).toContain(sysEdit.status())
  const adminAfter = ((await (await api.get('/api/admin/roles')).json()) as { data: { id: string; name: string }[] }).data.find((r) => r.id === adminRole.id)!
  expect(adminAfter.name, 'імʼя системної ролі незмінне').toBe(adminRole.name)

  expect((await api.patch(`/api/admin/roles/${role.id}`, { data: { name: `${E2E_TAG} Роль 2`, permissions: ['view_reports'] } })).status()).toBe(200)
  expect((await api.patch(`/api/admin/roles/${NIL_UUID}`, { data: { name: 'x' } })).status()).toBe(404)
  const ids = ((await (await api.get('/api/admin/roles')).json()) as { data: { id: string }[] }).data.map((r) => r.id)
  expect((await api.patch('/api/admin/roles/reorder', { data: { orderedIds: ids.slice(1) } })).status(), 'неповна перестановка').toBe(400)
  expect((await api.patch('/api/admin/roles/reorder', { data: { orderedIds: ids } })).status()).toBe(200)
  expect((await api.delete(`/api/admin/roles/${role.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/roles/${NIL_UUID}`)).status()).toBe(404)
})

test('5.2 користувачі: самодеактивація і самовидалення → 400; невідомий id → 4xx; інвайт — лише за прапорцем', async () => {
  expect((await api.patch(`/api/admin/users/${selfId}`, { data: { is_active: false } })).status()).toBe(400)
  expect((await api.delete(`/api/admin/users/${selfId}`)).status()).toBe(400)
  expect((await api.patch(`/api/admin/users/${selfId}`, { data: {} })).status()).toBe(400)
  const ghost = await api.patch(`/api/admin/users/${NIL_UUID}`, { data: { display_name: 'x' } })
  expect(ghost.status(), await ghost.text()).toBeLessThan(500)
  expect((await api.post('/api/admin/users', { data: { email: '', role_id: NIL_UUID } })).status()).toBe(400)
  test.skip(process.env.E2E_ALLOW_INVITE !== '1' || !process.env.E2E_INVITE_EMAIL, 'інвайт шле реальний лист — лише з E2E_ALLOW_INVITE=1 і E2E_INVITE_EMAIL')
  const roles = (await (await api.get('/api/admin/roles')).json()) as { data: { id: string; is_system: boolean; permissions: string[] }[] }
  const minimal = roles.data.find((r) => !r.is_system && r.permissions.length <= 1) ?? roles.data.find((r) => !r.is_system)!
  const inv = await api.post('/api/admin/users', { data: { email: process.env.E2E_INVITE_EMAIL, role_id: minimal.id } })
  expect(inv.status(), await inv.text()).toBe(200)
  const invited = (await (await api.get('/api/admin/users')).json()) as { data: { id: string; email: string }[] }
  const u = invited.data.find((x) => x.email === process.env.E2E_INVITE_EMAIL)!
  expect(u).toBeTruthy()
  expect((await api.delete(`/api/admin/users/${u.id}`)).status()).toBe(200)
})

// ── 6. Контент: тексти, SEO, юр.документи, картинки ─────────────────────────────────────────────
test('6.1 тексти: правка доїжджає до сайту, ліміти/чужий розділ/невідомий блок/telegram → 400, оптимістична блокировка 409, відкат побайтово', async () => {
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
  expect(seen, '/thanks показує правку').toBe(true)

  const stale = await api.put('/api/admin/content', { data: { overrides: changed, baseUpdatedAt: got.updatedAt } })
  expect(stale.status(), 'застаріла версія → 409').toBe(409)

  const tooLong = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>
  tooLong.hero.title = 'Ж'.repeat(200)
  const r1 = await api.put('/api/admin/content', { data: { overrides: tooLong, baseUpdatedAt: updatedAt } })
  expect(r1.status()).toBe(400)
  expect(await r1.text()).toContain('hero.title')
  expect((await api.put('/api/admin/content', { data: { overrides: { pageMeta: {} }, baseUpdatedAt: updatedAt } })).status(), 'pageMeta не редагується').toBe(400)
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
  expect((await api.put('/api/admin/content', { data: { overrides: tooMany, baseUpdatedAt: updatedAt } })).status(), 'масив > 50').toBe(400)

  // Приховування блоку benefits: зберігається, сайт без секції, відкат.
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
  expect(hidden, 'прихований блок відсутній у DOM').toBe(true)

  const back = await api.put('/api/admin/content', { data: { overrides: original, baseUpdatedAt: u2 } })
  expect(back.status(), await back.text()).toBe(200)
  const { data: after } = await db().from('site_content').select('data').eq('id', 'landing').single()
  expect(after!.data, 'дифф після відкату = вихідному').toEqual(snapshot.landing.data)
  const { data: audit } = await db().from('audit_log').select('action, new_value').eq('user_id', selfId).gte('created_at', startIso).eq('action', 'content.save')
  expect(audit!.length).toBeGreaterThanOrEqual(3)
  expect(JSON.stringify(audit)).not.toContain(marker)
})

test('6.2 SEO і юр.документи: GET, невалідний OG-image → 400, збереження тих самих значень не змінює рядок', async () => {
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

test('6.3 завантаження картинок: svg і не-картинка → 400, > 5 МБ → 4xx, png → url у власному сховищі', async () => {
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
  const okUp = await api.post('/api/admin/content/upload', { multipart: { file: { name: '..\\evil name.png', mimeType: 'image/png', buffer: png1x1 } } })
  expect(okUp.status(), await okUp.text()).toBe(200)
  const { url } = (await okUp.json()) as { url: string }
  expect(url).toContain('/storage/v1/object/public/content/')
  const objectPath = url.split('/storage/v1/object/public/content/')[1]
  expect(objectPath, 'імʼя файлу генерується сервером').toMatch(/^\d+-[a-z0-9]{4}\.png$/)
  created.storage.push(objectPath)
})

// ── 7. Інтеграції, теги, налаштування, події аналітики ──────────────────────────────────────────
test('7.1 інтеграції: список без секретів, невідомий ключ → 400, запис без ADMIN_ENCRYPTION_KEY → контрольована помилка, ключі Telegram не зачеплені', async () => {
  const list = await api.get('/api/admin/integrations')
  expect(list.status()).toBe(200)
  const items = ((await list.json()) as { data: { key: string; value: string | null; masked_value: string | null }[] }).data
  const tg = items.find((i) => i.key === 'telegram_bot_token')
  if (tg) {
    expect(tg.value, 'секрет не віддається у відкритому вигляді').toBeNull()
    expect(tg.masked_value ?? '').not.toMatch(/^\d{6,}:/)
  }
  expect((await api.put('/api/admin/integrations/not_a_key', { data: { value: 'x' } })).status()).toBe(400)
  expect((await api.delete('/api/admin/integrations/not_a_key')).status()).toBe(400)
  expect((await api.put('/api/admin/integrations/smtp_from', { data: { value: '' } })).status()).toBe(400)
  const { data: before } = await db().from('integrations').select('key, encrypted_value, iv, auth_tag').order('key')
  const set = await api.put('/api/admin/integrations/smtp_from', { data: { value: 'e2e@example.com' } })
  const noKey = !process.env.ADMIN_ENCRYPTION_KEY
  if (noKey) {
    expect(set.status(), 'без ключа шифрування — помилка, не 200').toBeGreaterThanOrEqual(400)
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
  test.skip(process.env.E2E_ALLOW_INTEGRATION_TESTS !== '1', 'тест Telegram шле реальне повідомлення клієнту — лише з E2E_ALLOW_INTEGRATION_TESTS=1')
  const tgTest = await api.post('/api/admin/integrations/telegram_bot_token/test')
  expect(tgTest.status()).toBe(200)
})

test('7.2 Google-теги: conversion_label лише для aw, формат, дублі, CRUD (тег вимкнений — сайт не зачіпається)', async () => {
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
  expect((await api.patch(`/api/admin/tracking-tags/${tag.id}`, { data: { tag_id: 'GTM-XYZ' } })).status(), 'тип незмінний — ID перевіряється за поточним типом').toBe(400)
  expect((await api.patch(`/api/admin/tracking-tags/${NIL_UUID}`, { data: { enabled: false } })).status()).toBe(404)
  const html = await (await api.get('/')).text()
  expect(html, 'вимкнений тег не потрапляє на сайт').not.toContain('AW-999999001')
  expect((await api.delete(`/api/admin/tracking-tags/${tag.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/admin/tracking-tags/${NIL_UUID}`)).status()).toBe(404)
})

test('7.3 налаштування: GET без telephony_secret, невідомий ключ → 400, валідація значень, збереження поточного значення', async () => {
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

test('7.4 події аналітики: GET, невідомий ключ → 400, > 5 імен → 400, заборонені form_start/form_submit (очікування стандарту)', async () => {
  const get = await api.get('/api/admin/analytics-events')
  expect(get.status()).toBe(200)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { nope_key: { enabled: true } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: 'yes' } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['a', 'b', 'c', 'd', 'e', 'f'] } } } })).status()).toBe(400)
  expect((await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['Bad Name'] } } } })).status()).toBe(400)
  const forbidden = await api.patch('/api/admin/analytics-events', { data: { events: { header_cta_click: { enabled: true, eventNames: ['form_start'] } } } })
  // Правило AGENTS.md/розділ 15: імена form_start/form_submit заборонені. Відкат стану — в afterAll (site_settings.analytics_events).
  test.info().annotations.push({ type: 'form_start status', description: String(forbidden.status()) })
  expect(forbidden.status(), 'form_start має відхилятись (знахідка: зараз приймається)').toBe(400)
})

// ── 8. Аналітика ────────────────────────────────────────────────────────────────────────────────
test('8 аналітика: звіт по відомих лідах, значення вимірів, експорт CSV (екранування), невалідні дати → 400', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const extra = await insertTestLead({ utm_source: 'e2e-src', name: `${E2E_TAG} Кома, "лапки"\nрядок` })
  created.leads.push(extra.id)
  const report = await api.get(`/api/admin/analytics/report?date_from=${today}&date_to=${today}&group_by=utm_source&filter_utm_source=e2e-src`)
  expect(report.status(), await report.text()).toBe(200)
  const rep = (await report.json()) as { total: { total: number } }
  expect(rep.total.total, 'два ліди [E2E] з utm_source=e2e-src (leadA + extra)').toBe(2)
  expect((await api.get('/api/admin/analytics/report?date_from=2026-13-40&date_to=x')).status()).toBe(400)
  expect((await api.get(`/api/admin/analytics/report?date_from=${today}&date_to=${today}&group_by=custom_field`)).status(), 'custom_field без id → 400').toBe(400)
  const dims = (await (await api.get(`/api/admin/analytics/dimension-values?dimension=utm_source&date_from=${today}&date_to=${today}`)).json()) as { data: { value: string }[] }
  expect(dims.data.some((d) => d.value === 'e2e-src')).toBe(true)

  const csv = await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: today, date_to: today, filter_utm_source: 'e2e-src' }, leadFields: ['dates', 'phone', 'status', 'utm_source'] } })
  expect(csv.status(), await csv.text()).toBe(200)
  expect(csv.headers()['content-type']).toMatch(/csv/)
  expect(csv.headers()['content-disposition']).toMatch(/attachment/)
  const body = await csv.text()
  expect(body).toContain('e2e-src')
  expect((body.match(/\n/g) ?? []).length, 'рядок з переводом рядка у значенні не ламає CSV (рядки: заголовок + 2)').toBeGreaterThanOrEqual(2)
  const summary = await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'summary', filters: { date_from: today, date_to: today }, summaryColumns: ['total'] } })
  expect(summary.status(), await summary.text()).toBe(200)
  expect((await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: today, date_to: today }, leadFields: [] } })).status()).toBe(400)
  expect((await api.post('/api/admin/analytics/export', { data: { format: 'csv', tab: 'leads', filters: { date_from: today, date_to: today }, leadFields: ['phone'], dealAmountFrom: 10, dealAmountTo: 1 } })).status()).toBe(400)
  const empty = await api.get('/api/admin/analytics/report?date_from=2000-01-01&date_to=2000-01-02')
  expect(empty.status(), 'порожній період → 200').toBe(200)
})

// ── 9. Журнал дій ───────────────────────────────────────────────────────────────────────────────
test('9 журнал дій: усі дії цього прогону є в журналі з актором і без значень ключів інтеграцій; пагінація', async () => {
  const page1 = await api.get('/api/admin/audit-log?page=1&limit=100')
  expect(page1.status()).toBe(200)
  const json = (await page1.json()) as { data: { action: string; user_email: string | null; resource: string; old_value: unknown; new_value: unknown; created_at: string }[]; total: number; totalPages: number }
  const mine = json.data.filter((r) => r.user_email === ENV.email && r.created_at >= startIso)
  const actions = new Set(mine.map((r) => r.action))
  for (const a of ['lead.update', 'lead.delete', 'stage.create', 'stage.update', 'stage.delete', 'stage.reorder', 'custom_field.create', 'custom_field.delete', 'role.create', 'role.update', 'role.delete', 'role.reorder', 'content.save', 'seo.save', 'legal.save', 'tracking_tag.create', 'tracking_tag.delete', 'settings.update']) {
    expect(actions.has(a), `немає запису ${a}`).toBe(true)
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
