// Безопасность админки и публичных API БЕЗ сессии (раздел 16 стандарта, Фаза 2 п. 4):
// middleware (редирект на /admin/login, 401 JSON для /api/admin/*), security-заголовки, dev-роут и cron
// без секрета, приёмник заявок (Zod → 400, honeypot → фейковый успех без записи и без расхода лимита,
// алиас /api/lead), отсутствие CORS-разрешений, RLS напрямую через REST с anon-ключом.
// Ничего не создаёт в БД: honeypot-запросы лид не пишут и уведомления не шлют.
import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

test.describe.configure({ mode: 'serial' })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'API-проверки — один раз (desktop)')
})

const SECURITY_HEADERS = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']

function expectSecurityHeaders(headers: Record<string, string>, where: string) {
  for (const h of SECURITY_HEADERS) expect(headers[h], `${where}: нет ${h}`).toBeTruthy()
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-powered-by']).toBeUndefined()
}

test('страницы админки без сессии → редирект на /admin/login; login и set-password открыты', async ({ request }) => {
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
    // HSTS — только в production-сборке (next start).
    expect(r.headers()['strict-transport-security']).toContain('max-age=')
  }
})

test('/api/admin/* без сессии → 401 JSON для всех методов, с security-заголовками', async ({ request }) => {
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

test('/api/cron/keepalive без секрета, с чужим или с "Bearer undefined" (CRON_SECRET не задан) → 401', async ({ request }) => {
  const r1 = await request.get('/api/cron/keepalive')
  expect(r1.status()).toBe(401)
  expect(await r1.json()).toEqual({ error: 'Unauthorized' })
  const r2 = await request.get('/api/cron/keepalive', { headers: { authorization: 'Bearer wrong-secret' } })
  expect(r2.status()).toBe(401)
  const r3 = await request.get('/api/cron/keepalive', { headers: { authorization: 'Bearer undefined' } })
  expect(r3.status(), 'без CRON_SECRET роут закрыт, а не «Bearer undefined»').toBe(401)
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

test('приёмник заявок без записи: невалидный JSON/Zod → 400 "Invalid data"; honeypot → { ok: true } без лида и без расхода лимита; /api/lead — тот же обработчик; GET → 405', async ({ request }) => {
  const before = await countLeads()
  const ip = { 'x-forwarded-for': '198.51.100.7' }

  const bad = await request.post('/api/leads', { headers: { 'content-type': 'application/json' }, data: '{not json' })
  expect(bad.status()).toBe(400)
  expect(await bad.json()).toEqual({ error: 'Invalid data' })

  const zod = await postLead(request, '/api/leads', { name: 'Тест', phone: '123' }, ip)
  expect(zod.status()).toBe(400)
  expect(await zod.json()).toEqual({ error: 'Invalid data' })

  const digitsInName = await postLead(request, '/api/leads', { name: 'E2E 123', phone: '+380991234567' }, ip)
  expect(digitsInName.status(), 'имя с цифрами не проходит Zod').toBe(400)

  // Honeypot: 5 запросов с одного IP подряд — все 200 (лимит 3/10 мин считает только сохранённые лиды).
  for (let i = 0; i < 5; i++) {
    const r = await postLead(request, i % 2 ? '/api/lead' : '/api/leads', { name: 'Тест Бот', phone: `+38099000010${i}`, company: 'bot inc' }, ip)
    expect(r.status(), `honeypot #${i}`).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  }

  const method = await request.get('/api/leads')
  expect(method.status()).toBe(405)

  const after = await countLeads()
  if (before !== null) expect(after, 'honeypot не создаёт лидов').toBe(before)
})

test('реферальные переходы: /r/<code> → 302 на /?ref=…&utm (с security-заголовками и HttpOnly cookie-списком касаний на 400 дней), /r/Bad..code → 404, слишком длинный ?ref → без Set-Cookie, /admin и /api без cookie; 9 кодов → ≤ 8 касаний, легаси-cookie читается', async ({ request }) => {
  const r = await request.get('/r/E2Eabc12?utm_source=p&utm_campaign=c', { maxRedirects: 0 })
  expect(r.status()).toBe(302)
  const loc = new URL(r.headers()['location'], 'http://127.0.0.1:3100')
  expect(loc.pathname).toBe('/')
  expect(loc.searchParams.get('ref')).toBe('e2eabc12')
  expect(loc.searchParams.get('utm_source')).toBe('p')
  expect(loc.searchParams.get('utm_campaign')).toBe('c')
  expectSecurityHeaders(r.headers(), '/r/<code>')
  const setCookie = r.headers()['set-cookie'] ?? ''
  expect(setCookie).toMatch(/lead_ref=v2_e2eabc12\.\d{9,10}(;|$)/)
  expect(setCookie).toMatch(/HttpOnly/i)
  expect(setCookie).toMatch(/SameSite=Lax/i)
  expect(setCookie).toMatch(/Max-Age=34560000/)
  expect(setCookie, 'http → без Secure (по протоколу запроса)').not.toMatch(/Secure/i)

  // Список касаний: существующая cookie дополняется, первый ts по коду сохраняется; свыше 8 — заменяется последнее.
  const now = Math.floor(Date.now() / 1000)
  const withOld = await request.get('/r/e2enew12', { maxRedirects: 0, headers: { cookie: `lead_ref=v2_e2eabc12.${now - 86400}` } })
  const value = decodeURIComponent((withOld.headers()['set-cookie'] ?? '').split(';')[0].replace('lead_ref=', ''))
  expect(value).toMatch(new RegExp(`^v2_e2eabc12\\.${now - 86400}_e2enew12\\.\\d{9,10}$`))
  const nine = Array.from({ length: 9 }, (_, i) => `v2_` + Array.from({ length: i }, (_, k) => `code${k}xxx.${now - 1000 + k}`).join('_'))
  const full = await request.get('/r/code9xxx', { maxRedirects: 0, headers: { cookie: `lead_ref=${nine[8]}` } })
  const fullValue = decodeURIComponent((full.headers()['set-cookie'] ?? '').split(';')[0].replace('lead_ref=', ''))
  const parts = fullValue.replace(/^v2_/, '').split('_')
  expect(parts, '≤ 8 касаний, ранние сохранены, последнее заменено').toHaveLength(8)
  expect(parts.slice(0, 7).map((p) => p.split('.')[0])).toEqual(['code0xxx', 'code1xxx', 'code2xxx', 'code3xxx', 'code4xxx', 'code5xxx', 'code6xxx'])
  expect(parts[7]).toMatch(/^code9xxx\./)
  // Легаси-cookie (голый код из прод-версии 2026-09-27) → касание «сейчас» + новый код.
  const legacy = await request.get('/r/e2enew12', { maxRedirects: 0, headers: { cookie: 'lead_ref=oldcode1' } })
  expect(decodeURIComponent((legacy.headers()['set-cookie'] ?? '').split(';')[0])).toMatch(/^lead_ref=v2_oldcode1\.\d{9,10}_e2enew12\.\d{9,10}$/)

  const bad = await request.get('/r/Bad..code', { maxRedirects: 0 })
  expect(bad.status()).toBe(404)
  const long = await request.get('/?ref=' + 'x'.repeat(200), { maxRedirects: 0 })
  expect(long.status()).toBe(200)
  expect(long.headers()['set-cookie'] ?? '').not.toContain('lead_ref')
  const home = await request.get('/?ref=abcd1234', { maxRedirects: 0 })
  // Контекст запросов держит cookie-jar: к новому касанию добавляются предыдущие из этого теста.
  expect(home.headers()['set-cookie'] ?? '').toMatch(/lead_ref=v2_(?:[a-z0-9]+\.\d+_)*abcd1234\.\d{9,10}/)
  const same = await request.get('/?ref=abcd1234', { maxRedirects: 0, headers: { cookie: `lead_ref=v2_abcd1234.${now - 5000}` } })
  expect(same.headers()['set-cookie'] ?? '', 'повторный ?ref: cookie переставлена, ts не изменён').toContain(`lead_ref=v2_abcd1234.${now - 5000}`)
  const admin = await request.get('/admin/login?ref=abcd1234')
  expect(admin.headers()['set-cookie'] ?? '', 'админка cookie не ставит').not.toContain('lead_ref')
})

test('CORS/Origin: ответы публичного API без Access-Control-Allow-Origin (чужой origin в браузере не прочитает ответ; сам запрос не блокируется — зафиксировано)', async ({ request }) => {
  const r = await postLead(request, '/api/leads', { name: 'Тест Бот', phone: '+380990001099', company: 'bot' }, { origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.8' })
  expect(r.status()).toBe(200)
  expect(r.headers()['access-control-allow-origin']).toBeUndefined()
  const pre = await request.fetch('/api/leads', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
  expect(pre.headers()['access-control-allow-origin']).toBeUndefined()
})

test('RLS напрямую через REST с anon-ключом: таблицы с PII/настройками пусты, запись в site_content закрыта', async ({ request }) => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'нет NEXT_PUBLIC_SUPABASE_URL / ANON_KEY')
  const headers = { apikey: ANON_KEY!, authorization: `Bearer ${ANON_KEY!}` }
  // Таблицы, где точно есть строки (site_settings, admin_roles, lead_statuses, audit_log, integrations, site_content).
  for (const table of ['site_settings', 'admin_roles', 'lead_statuses', 'audit_log', 'integrations', 'leads', 'user_roles', 'tracking_tags', 'offline_conversions', 'referral_links']) {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers })
    expect(r.status(), `${table}: ${await r.text()}`).toBe(200)
    expect(await r.json(), `${table}: anon видит строки`).toEqual([])
  }
  // site_content: чтение anon — тоже закрыто (SELECT только активному админу); сайт читает service-клиентом.
  const sc = await request.get(`${SUPABASE_URL}/rest/v1/site_content?select=id&limit=5`, { headers })
  expect(sc.status()).toBe(200)
  expect(await sc.json()).toEqual([])
  // Запись: INSERT/UPDATE/DELETE anon → отказ (401/403) или 0 строк; проверяем, что строка не появилась.
  const ins = await request.post(`${SUPABASE_URL}/rest/v1/site_content`, { headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' }, data: { id: 'e2e-rls-probe', data: {} } })
  expect([401, 403], `insert: ${ins.status()} ${await ins.text()}`).toContain(ins.status())
  const upd = await request.patch(`${SUPABASE_URL}/rest/v1/site_content?id=eq.landing`, { headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' }, data: { updated_by: 'e2e' } })
  expect(upd.status()).toBeLessThan(500)
  if (upd.status() < 300) expect(await upd.json(), 'update anon изменил строку').toEqual([])
  const del = await request.delete(`${SUPABASE_URL}/rest/v1/audit_log?id=neq.00000000-0000-0000-0000-000000000000`, { headers: { ...headers, prefer: 'return=representation' } })
  expect(del.status()).toBeLessThan(500)
  if (del.status() < 300) expect(await del.json(), 'delete anon удалил строки').toEqual([])
  if (SERVICE_KEY) {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY, { auth: { persistSession: false } })
    const { data } = await db.from('site_content').select('id').eq('id', 'e2e-rls-probe')
    expect(data ?? []).toEqual([])
  }
})
