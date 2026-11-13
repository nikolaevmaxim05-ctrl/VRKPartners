// Хелперы e2e админки: вход тестовым админом (UI-форма → cookie-сессия → API-контекст), сервисный клиент
// Supabase для проверок и очистки, маркировка тестовых данных, снимок/откат site_content.
// Тесты против ПРОДОВОЙ БД (решение владельца): всё, что создаётся, имеет префикс E2E_TAG и удаляется в teardown.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { request as playwrightRequest, type APIRequestContext, type Browser, type Page } from '@playwright/test'

export const E2E_TAG = '[E2E]'
/** Имя для публичного приёмника (Zod не пускает скобки/цифры): тоже маркер тестовых данных. */
export const E2E_PUBLIC_NAME = 'Тест Автотест'
export const E2E_PHONE_PREFIX = '+38099000'
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export const ENV = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
  /** Второй пользователь с минимальной ролью (только manage_leads) — для матрицы прав. */
  email2: process.env.E2E_ADMIN2_EMAIL,
  password2: process.env.E2E_ADMIN2_PASSWORD,
}

export function hasAdminCreds(): boolean {
  return Boolean(ENV.url && ENV.anon && ENV.service && ENV.email && ENV.password)
}

let dbClient: SupabaseClient | null = null
/** Сервисный клиент (RLS обходится) — только для проверок и очистки тестовых данных. */
export function db(): SupabaseClient {
  if (!dbClient) dbClient = createClient(ENV.url!, ENV.service!, { auth: { persistSession: false } })
  return dbClient
}

/** Существует ли пользователь и подходит ли пароль — через Auth REST (без cookie). null = войти не удалось. */
export async function probeLogin(email: string, password: string): Promise<{ userId: string; accessToken: string } | null> {
  const res = await fetch(`${ENV.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ENV.anon!, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { access_token: string; user: { id: string } }
  return { userId: json.user.id, accessToken: json.access_token }
}

/** Вход через форму /admin/login; возвращает API-контекст с cookie-сессией этого пользователя. */
export async function loginApi(browser: Browser, baseURL: string, email: string, password: string): Promise<{ api: APIRequestContext; page: Page }> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto('/admin/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 30_000 })
  const state = await context.storageState()
  const api = await playwrightRequest.newContext({ baseURL, storageState: state })
  return { api, page }
}

export type ContentSnapshot = Record<string, { data: unknown; updated_at: string; updated_by: string | null }>

/** Снимок строк site_content (landing/seo/legal) — для побайтового сравнения после тестов. */
export async function snapshotContent(): Promise<ContentSnapshot> {
  const { data, error } = await db().from('site_content').select('id, data, updated_at, updated_by').in('id', ['landing', 'seo', 'legal'])
  if (error) throw new Error(error.message)
  const out: ContentSnapshot = {}
  for (const row of data ?? []) out[row.id as string] = { data: row.data, updated_at: row.updated_at as string, updated_by: (row.updated_by as string | null) ?? null }
  return out
}

/** Восстанавливает строки до снимка (данные + метки времени клиента). Возвращает список восстановленных id. */
export async function restoreContent(snapshot: ContentSnapshot): Promise<string[]> {
  const restored: string[] = []
  const current = await snapshotContent()
  for (const [id, row] of Object.entries(snapshot)) {
    const cur = current[id]
    if (cur && JSON.stringify(cur.data) === JSON.stringify(row.data) && cur.updated_at === row.updated_at) continue
    const { error } = await db().from('site_content').update({ data: row.data, updated_at: row.updated_at, updated_by: row.updated_by }).eq('id', id)
    if (error) throw new Error(`restore ${id}: ${error.message}`)
    restored.push(id)
  }
  return restored
}

/** Тестовый лид напрямую в БД (без уведомлений и лимита). */
export async function insertTestLead(over: Record<string, unknown> = {}): Promise<{ id: string; order_no: number }> {
  const { data: initial } = await db().from('lead_statuses').select('id').eq('is_initial', true).limit(1).maybeSingle()
  const n = Math.floor(Math.random() * 900) + 100
  const row = {
    name: `${E2E_TAG} Тест Лід`,
    phone: `${E2E_PHONE_PREFIX}${n}`,
    status_id: initial?.id ?? null,
    locale: 'uk',
    ...over,
  }
  const { data, error } = await db().from('leads').insert(row).select('id, order_no').single()
  if (error) throw new Error(error.message)
  return data as { id: string; order_no: number }
}

export type CleanupReport = Record<string, number | string | boolean>

/** Удаляет всё с маркером E2E: лиды (с зависимостями), стадии, поля, роли, теги, записи журнала тестового пользователя. */
export async function cleanupE2E(opts: { sinceIso: string; userIds?: string[] }): Promise<CleanupReport> {
  const report: CleanupReport = {}
  const client = db()
  const { data: leads } = await client.from('leads').select('id').or(`name.like.${E2E_TAG}%,name.eq.${E2E_PUBLIC_NAME}`)
  const ids = (leads ?? []).map((l) => l.id as string)
  if (ids.length) {
    for (const t of ['conversion_adjustments', 'offline_conversions', 'lead_status_history', 'lead_comments', 'lead_custom_field_values']) {
      const { error, count } = await client.from(t).delete({ count: 'exact' }).in('lead_id', ids)
      report[t] = error ? `ERR ${error.message}` : (count ?? 0)
    }
    const { error, count } = await client.from('leads').delete({ count: 'exact' }).in('id', ids)
    report.leads = error ? `ERR ${error.message}` : (count ?? 0)
  } else report.leads = 0
  // referral_links — после лидов (FK on delete restrict).
  for (const [table, col] of [['lead_custom_fields', 'name'], ['lead_statuses', 'name'], ['tracking_tags', 'label'], ['admin_roles', 'name'], ['referral_links', 'name']] as const) {
    const { error, count } = await client.from(table).delete({ count: 'exact' }).like(col, `${E2E_TAG}%`)
    report[table] = error ? `ERR ${error.message}` : (count ?? 0)
  }
  if (opts.userIds?.length) {
    const { error, count } = await client.from('audit_log').delete({ count: 'exact' }).in('user_id', opts.userIds).gte('created_at', opts.sinceIso)
    report.audit_log = error ? `ERR ${error.message}` : (count ?? 0)
  }
  return report
}

/** Остатки с маркером E2E во всех задействованных таблицах — после очистки должно быть пусто. */
export async function leftoversE2E(): Promise<Record<string, number>> {
  const client = db()
  const out: Record<string, number> = {}
  for (const [table, col] of [['leads', 'name'], ['lead_custom_fields', 'name'], ['lead_statuses', 'name'], ['tracking_tags', 'label'], ['admin_roles', 'name'], ['referral_links', 'name']] as const) {
    const { count } = await client.from(table).select('id', { count: 'exact', head: true }).like(col, `${E2E_TAG}%`)
    out[table] = count ?? 0
  }
  const { count: pub } = await client.from('leads').select('id', { count: 'exact', head: true }).eq('name', E2E_PUBLIC_NAME)
  out.leads += pub ?? 0
  return out
}
