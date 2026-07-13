// Google Sheets integration: build conversion rows and append via Sheets API v4.
// Auth: service account JWT (no external packages — uses Node.js crypto).
// Конфігурація: DB-first через getIntegration (ключі google_sheets_service_account_json,
// google_spreadsheet_id), фолбек на GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SPREADSHEET_ID env.
import { createHash, createSign } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getIntegration } from '@/lib/integrations/get-integration'
import { toGoogleAdsTime } from '@/lib/conversions'

// ── Auth ─────────────────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string
  private_key: string
}

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlBuf(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = base64urlBuf(sign.sign(sa.private_key))
  const jwt = `${signingInput}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`OAuth2 token error: ${await res.text()}`)
  const { access_token } = await res.json() as { access_token: string }
  return access_token
}

// ── Доступ до Sheets (для тест-роуту і appendRow) ────────────────────────────
// Повертає null якщо нічого не сконфігуровано — без throws.

type SheetsAccess = { serviceAccount: ServiceAccount; spreadsheetId: string; accessToken: string }

// kind='conversions' → google_spreadsheet_id (основна таблиця офлайн-конверсій)
// kind='adjustments' → google_adjustments_spreadsheet_id (окрема таблиця корекцій)
// Той самий service account у обох випадках.
async function getSheetsAccessFor(spreadsheetKey: string): Promise<SheetsAccess | null> {
  const [saJson, spreadsheetId] = await Promise.all([
    getIntegration('google_sheets_service_account_json'),
    getIntegration(spreadsheetKey),
  ])
  if (!saJson || !spreadsheetId) {
    return null
  }
  let serviceAccount: ServiceAccount
  try {
    serviceAccount = JSON.parse(saJson) as ServiceAccount
  } catch {
    console.error('[google-sheets] invalid service account JSON')
    return null
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    console.error('[google-sheets] service account missing client_email or private_key')
    return null
  }
  const accessToken = await getAccessToken(serviceAccount)
  return { serviceAccount, spreadsheetId, accessToken }
}

export async function getSheetsAccess(): Promise<SheetsAccess | null> {
  return getSheetsAccessFor('google_spreadsheet_id')
}

// Доступ до окремої таблиці корекцій конверсій (той самий service account).
export async function getAdjustmentsSheetsAccess(): Promise<SheetsAccess | null> {
  return getSheetsAccessFor('google_adjustments_spreadsheet_id')
}

// ── Тест зʼєднання — повертає назву таблиці або зрозумілу помилку ──────────
// Без побічних ефектів: нічого не пише, не змінює БД.

// Тягне назву таблиці за готовим access token. Спільний хелпер для основної
// таблиці (getSheetTitle) і таблиці корекцій (getAdjustmentsSheetTitle).
async function fetchSheetTitle(
  spreadsheetId: string,
  accessToken: string,
): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 403) {
        return { ok: false, message: 'Service Account не має доступу до таблиці. Поділіться таблицею з адресою client_email (Editor).' }
      }
      if (res.status === 404) {
        return { ok: false, message: 'Таблицю не знайдено. Перевірте Spreadsheet ID.' }
      }
      return { ok: false, message: `Sheets API ${res.status}: ${text || 'невідома помилка'}` }
    }
    const json = await res.json() as { properties?: { title?: string } }
    const title = json.properties?.title?.trim()
    if (!title) return { ok: false, message: 'Sheets API повернув порожню назву таблиці' }
    return { ok: true, title }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Не вдалося зʼєднатися з Sheets API' }
  }
}

export async function getSheetTitle(): Promise<
  | { ok: true; title: string; spreadsheetId: string; accessToken: string }
  | { ok: false; message: string }
> {
  const [saJson, spreadsheetId] = await Promise.all([
    getIntegration('google_sheets_service_account_json'),
    getIntegration('google_spreadsheet_id'),
  ])
  if (!saJson) return { ok: false, message: 'Service Account JSON не збережено' }
  if (!spreadsheetId) return { ok: false, message: 'Spreadsheet ID не збережено' }

  let sa: ServiceAccount
  try {
    sa = JSON.parse(saJson) as ServiceAccount
  } catch {
    return { ok: false, message: 'Service Account JSON має некоректний формат (не вдалося розпарсити)' }
  }
  if (!sa.client_email || !sa.private_key) {
    return { ok: false, message: 'Service Account JSON не містить client_email або private_key' }
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(sa)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Не вдалося отримати access token: ${msg}` }
  }

  const res = await fetchSheetTitle(spreadsheetId, accessToken)
  if (!res.ok) return { ok: false, message: res.message }
  return { ok: true, title: res.title, spreadsheetId, accessToken }
}

// Тест таблиці корекцій (той самий service account). Якщо
// google_adjustments_spreadsheet_id не заданий — повертає not_configured (не помилка).
export async function getAdjustmentsSheetTitle(): Promise<
  | { status: 'ok'; title: string; spreadsheetId: string; accessToken: string }
  | { status: 'not_configured' }
  | { status: 'error'; message: string }
> {
  const adjustmentsId = await getIntegration('google_adjustments_spreadsheet_id')
  if (!adjustmentsId) return { status: 'not_configured' }

  const access = await getAdjustmentsSheetsAccess()
  if (!access) {
    return { status: 'error', message: 'Service Account JSON не збережено або має некоректний формат' }
  }

  const res = await fetchSheetTitle(access.spreadsheetId, access.accessToken)
  if (!res.ok) return { status: 'error', message: res.message }
  return { status: 'ok', title: res.title, spreadsheetId: access.spreadsheetId, accessToken: access.accessToken }
}

/**
 * Виставляє колонки phone_number (C, index 2) і event_time (G, index 6)
 * як Plain text у першому аркуші таблиці. Запобігає автоматичним апострофам
 * Sheets перед значеннями що схожі на формулу/дату.
 * Ідемпотентно — можна викликати скільки завгодно разів.
 *
 * Існуючі рядки таблиці НЕ переформатуються — Sheets зберігає raw value
 * без апострофа, але візуальний префікс лишиться у вже записаних комірках.
 * Перезаписати їх — окремий endpoint (див. prompts/TODO.md).
 */
export async function ensureTextColumns(
  accessToken: string,
  spreadsheetId: string,
  colIndices: number[] = [2, 6],
): Promise<boolean> {
  try {
    // sheetId першого аркуша — потрібен для batchUpdate
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!metaRes.ok) {
      console.warn('[google-sheets] ensureTextColumns: meta fetch failed', await metaRes.text().catch(() => ''))
      return false
    }
    const meta = await metaRes.json() as { sheets?: Array<{ properties?: { sheetId?: number } }> }
    const sheetId = meta.sheets?.[0]?.properties?.sheetId
    if (sheetId === undefined) {
      console.warn('[google-sheets] ensureTextColumns: no sheetId found')
      return false
    }

    // За замовчуванням: C (index 2, phone_number) і G (index 6, event_time).
    // Для листа корекцій передається [2] (Adjustment Time).
    const requests = colIndices.map((colIdx) => ({
      repeatCell: {
        range: {
          sheetId,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    }))

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn('[google-sheets] ensureTextColumns: batchUpdate failed', await res.text().catch(() => ''))
      return false
    }
    console.log('[google-sheets] ensureTextColumns: OK', { spreadsheetId, sheetId })
    return true
  } catch (e) {
    console.warn('[google-sheets] ensureTextColumns failed', e instanceof Error ? e.message : e)
    return false
  }
}

// ── Утиліти для хешів і телефону ─────────────────────────────────────────────

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// E.164 з плюсом: "+380509663258"
// Плюс-префікс запобігає появі апострофа в Google Sheets (рядок не схожий на число).
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380')) return `+${digits}`
  if (digits.startsWith('38') && digits.length >= 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length >= 9) return `+38${digits}`
  return `+${digits}`
}

// "YYYY-MM-DD HH:MM:SS" у київському часі
function readableKyivTime(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// ── Побудова рядка ───────────────────────────────────────────────────────────

export type ConversionRowParams = {
  conversionAction: string
  email: string | null
  phone: string | null
  conversionTime: string  // ISO
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  conversionValue: number | null
  currency: string
  orderNo: number  // Order ID = наскрізний leads.order_no (не UUID)
}

// Повертає (string | number)[] — числові колонки як JS number (для Sheets RAW mode).
// CSV-експорт конвертує їх у рядки сам.
export function buildConversionRow(params: ConversionRowParams): (string | number)[] {
  const phone = normalizePhone(params.phone)
  const email = (params.email ?? '').toLowerCase().trim()
  // number — Sheets API з valueInputOption=RAW зберігає як INTEGER, без апострофа
  const unixTs = Math.floor(new Date(params.conversionTime).getTime() / 1000)

  return [
    params.conversionAction,                       // Conversion Name     (string)
    email,                                         // email               (string)
    phone,                                         // phone_number        (string)
    email ? sha256hex(email) : '',                 // sha256_email_address(string)
    phone ? sha256hex(phone) : '',                 // sha256_phone_number (string)
    unixTs,                                        // conversion_event_time (number!)
    readableKyivTime(params.conversionTime),       // event_time          (string)
    params.gclid ?? '',                            // gclid               (string)
    params.gbraid ?? '',                           // gbraid              (string)
    params.wbraid ?? '',                           // wbraid              (string)
    params.conversionValue != null
      ? params.conversionValue                     // conversion_value    (number!)
      : '',
    params.currency,                               // currency_code       (string)
    params.orderNo,                                // order_id            (number = order_no)
  ]
}

// ── Append до Google Sheets ───────────────────────────────────────────────────

// Повертає true якщо рядок реально відправлено; false — якщо Sheets не сконфігуровано.
async function appendRow(row: (string | number)[]): Promise<boolean> {
  const access = await getSheetsAccess()
  if (!access) {
    console.warn('[google-sheets] not configured, skipping')
    return false
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(access.spreadsheetId)}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!res.ok) throw new Error(`Sheets API error: ${await res.text()}`)
  return true
}

// ── Публічна функція: підтягує settings і відправляє рядок ──────────────────

export type LeadInput = {
  lead_id: string
  order_no: number  // наскрізний Order ID
  email: string | null
  phone: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  // Готове значення конверсії, розраховане ВИКЛИКАЧЕМ за логікою стадії
  // (deal → amount, deal_adjustment → profit, стадія без суми → null).
  // C2: google-sheets більше НЕ перераховує його за глобальним deal_amount_type —
  // інакше фід Google Ads розходився б з offline_conversions.
  conversionValue: number | null
  // Якщо передано — використовуємо замість site_settings.google_ads_conversion_action.
  // Береться зі статусу ліда (lead_statuses.conversion_action).
  conversionAction?: string | null
}

// Повертає true якщо конверсію реально відправлено в Sheets, false — якщо пропущено
// (Sheets не сконфігуровано). Кидає помилку при збої API.
export async function sendConversionToSheets(lead: LeadInput): Promise<boolean> {
  console.log('[google-sheets] sendConversionToSheets called', {
    lead_id: lead.lead_id,
    conversionValue: lead.conversionValue,
    conversionAction: lead.conversionAction,
  })

  const supabase = createServiceClient()
  const { data: settings, error: settErr } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['google_ads_conversion_action', 'internal_currency'])

  if (settErr) {
    console.error('[google-sheets] settings_fetch_failed', settErr.message)
  }

  const get = (k: string, fallback: string) =>
    settings?.find((s: { key: string }) => s.key === k)?.value?.trim() || fallback

  // Пріоритет: параметр зі статусу → site_settings → 'Lead'
  const conversionAction = lead.conversionAction?.trim() || get('google_ads_conversion_action', 'Lead')
  const currency = get('internal_currency', 'UAH')

  // C2: значення приходить ГОТОВИМ від викликача (за логікою стадії) — не перераховуємо.
  const conversionValue = lead.conversionValue

  console.log('[google-sheets] row params', {
    conversionAction, currency, conversionValue,
  })

  const row = buildConversionRow({
    conversionAction,
    email: lead.email,
    phone: lead.phone,
    conversionTime: new Date().toISOString(),
    gclid: lead.gclid,
    gbraid: lead.gbraid,
    wbraid: lead.wbraid,
    conversionValue: conversionValue != null ? Number(conversionValue) : null,
    currency,
    orderNo: lead.order_no,
  })

  // PII guard: не логуємо plaintext email/phone (row[1], row[2]) у Vercel logs.
  console.log('[google-sheets] row built', { leadId: lead.lead_id, cols: row.length })
  const sent = await appendRow(row)
  console.log('[google-sheets] append_done', { leadId: lead.lead_id, sent })
  return sent
}

// ── Корекції конверсій (RETRACT/RESTATE) — окрема таблиця ─────────────────────
// Формат рядка = Google Ads adjustments feed:
// Order ID | Conversion Name | Adjustment Time | Adjustment Type | Adjusted Value | Adjusted Value Currency
export type AdjustmentRowParams = {
  orderNo: number
  conversionAction: string
  adjustmentTime: string  // ISO
  type: 'retract' | 'restate'
  value: number | null    // null для retract
  currency: string | null // null для retract
}

export function buildAdjustmentRow(params: AdjustmentRowParams): (string | number)[] {
  return [
    params.orderNo,                                  // Order ID              (number = order_no)
    params.conversionAction,                         // Conversion Name       (string)
    toGoogleAdsTime(params.adjustmentTime),          // Adjustment Time       (string)
    params.type === 'retract' ? 'RETRACT' : 'RESTATE', // Adjustment Type     (string)
    params.value != null ? params.value : '',        // Adjusted Value        (number або '')
    params.currency ?? '',                           // Adjusted Value Currency (string)
  ]
}

// Форматуємо колонку Adjustment Time (index 2) як TEXT один раз на інстанс —
// щоб Sheets не інтерпретував зсув часу як дату при ручному редагуванні.
const adjustmentsFormatted = new Set<string>()

// Повертає true якщо рядок реально відправлено; false — якщо таблиця корекцій не сконфігурована.
// Кидає помилку при збої Sheets API.
export async function sendAdjustmentToSheets(params: AdjustmentRowParams): Promise<boolean> {
  const access = await getAdjustmentsSheetsAccess()
  if (!access) {
    console.warn('[google-sheets] adjustments sheet not configured, skipping')
    return false
  }

  if (!adjustmentsFormatted.has(access.spreadsheetId)) {
    adjustmentsFormatted.add(access.spreadsheetId)
    // best-effort, не блокує відправку
    ensureTextColumns(access.accessToken, access.spreadsheetId, [2]).catch(() => {})
  }

  const row = buildAdjustmentRow(params)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(access.spreadsheetId)}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!res.ok) throw new Error(`Sheets API error: ${await res.text()}`)
  console.log('[google-sheets] adjustment appended', { orderNo: params.orderNo, type: params.type })
  return true
}
