// Безпека адмінки та публічних API БЕЗ сесії (розділ 16 стандарту, Фаза 2 п. 4):
// middleware (редирект на /admin/login, 401 JSON для /api/admin/*), security-заголовки, dev-роут і cron
// без секрету, приймач заявок (Zod → 400, honeypot → фейковий успіх без запису й без витрати ліміту,
// алиас /api/lead), відсутність CORS-дозволів, RLS напряму через REST з anon-ключем.
// Нічого не створює в БД: honeypot-запити лід не пишуть і сповіщення не шлють.
import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

test.describe.configure({ mode: 'serial' })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'API-перевірки — один раз (desktop)')
})

const SECURITY_HEADERS = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']

function expectSecurityHeaders(headers: Record<string, string>, where: string) {
  for (const h of SECURITY_HEADERS) expect(headers[h], `${where}: немає ${h}`).toBeTruthy()
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-powered-by']).toBeUndefined()
}

test('сторінки адмінки без сесії → редирект на /admin/login; login і set-password відкриті', async ({ request }) => {
  for (const path of ['/admin', '/admin/leads', '/admin/content', '/admin/audit-log', '/admin/users', '/admin/leads/00000000-0000-0000-0000-000000000000']) {
    const r = await request.get(path, { maxRedirects: 0 })
    expect([302, 307, 308], `${path}: статус ${r.status()}`).toContain(r.status())
    expect(r.headers()['location']).toMatch(/\/admin\/login$/)
    expectSecurityHeaders(r.headers(), path)
  }
  for (const path of ['/admin/login', '/admin/set-password']) {
    const r = await request.get(path)
    expect(r.status(), path).toBe(200)
    expectSecurityHeaders(r.headers(), path)
    // HSTS — лише у production-збірці (next start).
    expect(r.headers()['strict-transport-security']).toContain('max-age=')
  }
})

test('/api/admin/* без сесії → 401 JSON для всіх методів, зі security-заголовками', async ({ request }) => {
  const cases: [string, 'get' | 'post' | 'put' | 'patch' | 'delete'][] = [
    ['/api/admin/leads', 'get'],
    ['/api/admin/leads/00000000-0000-0000-0000-000000000000', 'patch'],
    ['/api/admin/lead-statuses', 'post'],
    ['/api/admin/content', 'put'],
    ['/api/admin/users/00000000-0000-0000-0000-000000000000', 'delete'],
    ['/api/admin/integrations', 'get'],
    ['/api/admin/audit-log', 'get'],
    ['/api/admin/dev/ga4-arrival', 'post'],
    ['/api/admin/neiснуючий-роут', 'get'],
  ]
  for (const [path, method] of cases) {
    const r = await request[method](path, { data: {} })
    expect(r.status(), `${method.toUpperCase()} ${path}`).toBe(401)
    expect(await r.json()).toEqual({ error: 'Unauthorized' })
    expectSecurityHeaders(r.headers(), path)
  }
})

test('/api/cron/keepalive без секрету, з чужим або з "Bearer undefined" (CRON_SECRET не задано) → 401', async ({ request }) => {
  const r1 = await request.get('/api/cron/keepalive')
  expect(r1.status()).toBe(401)
  expect(await r1.json()).toEqual({ error: 'Unauthorized' })
  const r2 = await request.get('/api/cron/keepalive', { headers: { authorization: 'Bearer wrong-secret' } })
  expect(r2.status()).toBe(401)
  const r3 = await request.get('/api/cron/keepalive', { headers: { authorization: 'Bearer undefined' } })
  expect(r3.status(), 'без CRON_SECRET роут закритий, а не «Bearer undefined»').toBe(401)
})

async function countLeads(): Promise<number | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function postLead(request: APIRequestContext, path: string, body: unknown, headers: Record<string, string> = {}) {
  return request.post(path, { data: body, headers: { 'content-type': 'application/json', ...headers } })
}

test('приймач заявок без запису: невалідний JSON/Zod → 400 "Invalid data"; honeypot → { ok: true } без ліда і без витрати ліміту; /api/lead — той самий обробник; GET → 405', async ({ request }) => {
  const before = await countLeads()
  const ip = { 'x-forwarded-for': '198.51.100.7' }

  const bad = await request.post('/api/leads', { headers: { 'content-type': 'application/json' }, data: '{not json' })
  expect(bad.status()).toBe(400)
  expect(await bad.json()).toEqual({ error: 'Invalid data' })

  const zod = await postLead(request, '/api/leads', { name: 'Тест', phone: '123' }, ip)
  expect(zod.status()).toBe(400)
  expect(await zod.json()).toEqual({ error: 'Invalid data' })

  const digitsInName = await postLead(request, '/api/leads', { name: 'E2E 123', phone: '+380991234567' }, ip)
  expect(digitsInName.status(), 'імʼя з цифрами не проходить Zod').toBe(400)

  // Honeypot: 5 запитів з одного IP поспіль — усі 200 (ліміт 3/10 хв рахує лише збережені ліди).
  for (let i = 0; i < 5; i++) {
    const r = await postLead(request, i % 2 ? '/api/lead' : '/api/leads', { name: 'Тест Бот', phone: `+38099000010${i}`, company: 'bot inc' }, ip)
    expect(r.status(), `honeypot #${i}`).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  }

  const method = await request.get('/api/leads')
  expect(method.status()).toBe(405)

  const after = await countLeads()
  if (before !== null) expect(after, 'honeypot не створює лідів').toBe(before)
})

test('CORS/Origin: відповіді публічного API без Access-Control-Allow-Origin (чужий origin у браузері не прочитає відповідь; сам запит не блокується — зафіксовано)', async ({ request }) => {
  const r = await postLead(request, '/api/leads', { name: 'Тест Бот', phone: '+380990001099', company: 'bot' }, { origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.8' })
  expect(r.status()).toBe(200)
  expect(r.headers()['access-control-allow-origin']).toBeUndefined()
  const pre = await request.fetch('/api/leads', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
  expect(pre.headers()['access-control-allow-origin']).toBeUndefined()
})

test('RLS напряму через REST з anon-ключем: таблиці з PII/налаштуваннями порожні, запис у site_content закрита', async ({ request }) => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'немає NEXT_PUBLIC_SUPABASE_URL / ANON_KEY')
  const headers = { apikey: ANON_KEY!, authorization: `Bearer ${ANON_KEY!}` }
  // Таблиці, де точно є рядки (site_settings, admin_roles, lead_statuses, audit_log, integrations, site_content).
  for (const table of ['site_settings', 'admin_roles', 'lead_statuses', 'audit_log', 'integrations', 'leads', 'user_roles', 'tracking_tags', 'offline_conversions']) {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers })
    expect(r.status(), `${table}: ${await r.text()}`).toBe(200)
    expect(await r.json(), `${table}: anon бачить рядки`).toEqual([])
  }
  // site_content: читання anon — теж закрите (SELECT лише активному адміну); сайт читає service-клієнтом.
  const sc = await request.get(`${SUPABASE_URL}/rest/v1/site_content?select=id&limit=5`, { headers })
  expect(sc.status()).toBe(200)
  expect(await sc.json()).toEqual([])
  // Запис: INSERT/UPDATE/DELETE anon → відмова (401/403) або 0 рядків; перевіряємо, що рядок не зʼявився.
  const ins = await request.post(`${SUPABASE_URL}/rest/v1/site_content`, { headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' }, data: { id: 'e2e-rls-probe', data: {} } })
  expect([401, 403], `insert: ${ins.status()} ${await ins.text()}`).toContain(ins.status())
  const upd = await request.patch(`${SUPABASE_URL}/rest/v1/site_content?id=eq.landing`, { headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' }, data: { updated_by: 'e2e' } })
  expect(upd.status()).toBeLessThan(500)
  if (upd.status() < 300) expect(await upd.json(), 'update anon змінив рядок').toEqual([])
  const del = await request.delete(`${SUPABASE_URL}/rest/v1/audit_log?id=neq.00000000-0000-0000-0000-000000000000`, { headers: { ...headers, prefer: 'return=representation' } })
  expect(del.status()).toBeLessThan(500)
  if (del.status() < 300) expect(await del.json(), 'delete anon видалив рядки').toEqual([])
  if (SERVICE_KEY) {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY, { auth: { persistSession: false } })
    const { data } = await db.from('site_content').select('id').eq('id', 'e2e-rls-probe')
    expect(data ?? []).toEqual([])
  }
})
