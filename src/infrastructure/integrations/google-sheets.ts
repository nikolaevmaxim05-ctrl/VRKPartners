// infrastructure/integrations/google-sheets — офлайн-конверсії та корекції у Google Sheets.
// Auth: service account JWT (RS256 на вбудованому crypto). Sheets API v4 values:append, RAW.
// Конфігурація: IntegrationConfig (БД → env). Поведінка без змін.
import { createHash, createSign } from 'crypto'
import type { IntegrationConfig, SettingsRepository } from '@core/application/ports/settings'
import type {
  ConversionSheetExporter,
  ConversionSheetInput,
  AdjustmentSheetInput,
  SheetsTestResult,
} from '@core/application/ports/conversions'
import { toGoogleAdsTime } from '@core/domain/funnel/google-ads-time'

interface ServiceAccount {
  client_email: string
  private_key: string
}

type SheetsAccess = { serviceAccount: ServiceAccount; spreadsheetId: string; accessToken: string }

// ── Auth ─────────────────────────────────────────────────────────────────────

const base64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
const base64urlBuf = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

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
  const jwt = `${signingInput}.${base64urlBuf(sign.sign(sa.private_key))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`OAuth2 token error: ${await res.text()}`)
  const { access_token } = (await res.json()) as { access_token: string }
  return access_token
}

// ── Утиліти для хешів і телефону ─────────────────────────────────────────────

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// E.164 з плюсом: "+380509663258" (плюс запобігає апострофу в Sheets).
// Фаза 4: замінюється єдиною normalizePhone ядра.
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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// ── Побудова рядків ──────────────────────────────────────────────────────────

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
  orderNo: number  // Order ID = наскрізний leads.order_no
}

/** Числові колонки — JS number (Sheets RAW зберігає як INTEGER без апострофа). */
export function buildConversionRow(params: ConversionRowParams): (string | number)[] {
  const phone = normalizePhone(params.phone)
  const email = (params.email ?? '').toLowerCase().trim()
  const unixTs = Math.floor(new Date(params.conversionTime).getTime() / 1000)
  return [
    params.conversionAction,                  // Conversion Name
    email,                                    // email
    phone,                                    // phone_number
    email ? sha256hex(email) : '',            // sha256_email_address
    phone ? sha256hex(phone) : '',            // sha256_phone_number
    unixTs,                                   // conversion_event_time (number)
    readableKyivTime(params.conversionTime),  // event_time
    params.gclid ?? '',                       // gclid
    params.gbraid ?? '',                      // gbraid
    params.wbraid ?? '',                      // wbraid
    params.conversionValue != null ? params.conversionValue : '', // conversion_value (number)
    params.currency,                          // currency_code
    params.orderNo,                           // order_id (number)
  ]
}

/** Order ID | Conversion Name | Adjustment Time | Adjustment Type | Adjusted Value | Currency */
export function buildAdjustmentRow(params: AdjustmentSheetInput): (string | number)[] {
  return [
    params.orderNo,
    params.conversionAction,
    toGoogleAdsTime(params.adjustmentTime),
    params.type === 'retract' ? 'RETRACT' : 'RESTATE',
    params.value != null ? params.value : '',
    params.currency ?? '',
  ]
}

// ── Sheets API ───────────────────────────────────────────────────────────────

async function fetchSheetTitle(
  spreadsheetId: string,
  accessToken: string,
): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 403) {
        return { ok: false, message: 'Service Account не має доступу до таблиці. Поділіться таблицею з адресою client_email (Editor).' }
      }
      if (res.status === 404) return { ok: false, message: 'Таблицю не знайдено. Перевірте Spreadsheet ID.' }
      return { ok: false, message: `Sheets API ${res.status}: ${text || 'невідома помилка'}` }
    }
    const json = (await res.json()) as { properties?: { title?: string } }
    const title = json.properties?.title?.trim()
    if (!title) return { ok: false, message: 'Sheets API повернув порожню назву таблиці' }
    return { ok: true, title }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Не вдалося зʼєднатися з Sheets API' }
  }
}

/** Колонки як Plain text у першому аркуші (ідемпотентно, best-effort). */
export async function ensureTextColumns(accessToken: string, spreadsheetId: string, colIndices: number[] = [2, 6]): Promise<boolean> {
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) })
    if (!metaRes.ok) {
      console.warn('[google-sheets] ensureTextColumns: meta fetch failed', await metaRes.text().catch(() => ''))
      return false
    }
    const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { sheetId?: number } }> }
    const sheetId = meta.sheets?.[0]?.properties?.sheetId
    if (sheetId === undefined) {
      console.warn('[google-sheets] ensureTextColumns: no sheetId found')
      return false
    }
    const requests = colIndices.map((colIdx) => ({
      repeatCell: {
        range: { sheetId, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    }))
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
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

async function appendRow(access: SheetsAccess, row: (string | number)[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(access.spreadsheetId)}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!res.ok) throw new Error(`Sheets API error: ${await res.text()}`)
}

// ── Адаптер порту ────────────────────────────────────────────────────────────

export function makeGoogleSheetsExporter(deps: {
  config: IntegrationConfig
  settings: SettingsRepository
}): ConversionSheetExporter {
  const { config } = deps

  // kind: google_spreadsheet_id (конверсії) або google_adjustments_spreadsheet_id (корекції).
  async function accessFor(spreadsheetKey: string): Promise<SheetsAccess | null> {
    const [saJson, spreadsheetId] = await Promise.all([
      config.get('google_sheets_service_account_json'),
      config.get(spreadsheetKey),
    ])
    if (!saJson || !spreadsheetId) return null
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
    return { serviceAccount, spreadsheetId, accessToken: await getAccessToken(serviceAccount) }
  }

  // Колонку Adjustment Time форматуємо як TEXT один раз на інстанс.
  const adjustmentsFormatted = new Set<string>()

  return {
    async sendConversion(lead: ConversionSheetInput) {
      console.log('[google-sheets] sendConversionToSheets called', {
        lead_id: lead.lead_id,
        conversionValue: lead.conversionValue,
        conversionAction: lead.conversionAction,
      })
      const settings = await deps.settings.getMany(['google_ads_conversion_action', 'internal_currency'])
      if (!settings.ok) console.error('[google-sheets] settings_fetch_failed', settings.error)
      const get = (k: string, fallback: string) => (settings.ok ? settings.data.get(k)?.trim() : undefined) || fallback

      // Пріоритет: параметр зі статусу → site_settings → 'Lead'
      const conversionAction = lead.conversionAction?.trim() || get('google_ads_conversion_action', 'Lead')
      const currency = get('internal_currency', 'UAH')
      const conversionValue = lead.conversionValue
      console.log('[google-sheets] row params', { conversionAction, currency, conversionValue })

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
      // PII guard: не логуємо plaintext email/phone.
      console.log('[google-sheets] row built', { leadId: lead.lead_id, cols: row.length })

      const access = await accessFor('google_spreadsheet_id')
      if (!access) {
        console.warn('[google-sheets] not configured, skipping')
        console.log('[google-sheets] append_done', { leadId: lead.lead_id, sent: false })
        return false
      }
      await appendRow(access, row)
      console.log('[google-sheets] append_done', { leadId: lead.lead_id, sent: true })
      return true
    },

    async sendAdjustment(params: AdjustmentSheetInput) {
      const access = await accessFor('google_adjustments_spreadsheet_id')
      if (!access) {
        console.warn('[google-sheets] adjustments sheet not configured, skipping')
        return false
      }
      if (!adjustmentsFormatted.has(access.spreadsheetId)) {
        adjustmentsFormatted.add(access.spreadsheetId)
        ensureTextColumns(access.accessToken, access.spreadsheetId, [2]).catch(() => {})
      }
      await appendRow(access, buildAdjustmentRow(params))
      console.log('[google-sheets] adjustment appended', { orderNo: params.orderNo, type: params.type })
      return true
    },

    async testConnection(): Promise<SheetsTestResult> {
      // ── Основна таблиця офлайн-конверсій ──
      const [saJson, spreadsheetId] = await Promise.all([
        config.get('google_sheets_service_account_json'),
        config.get('google_spreadsheet_id'),
      ])
      const mainFail = (message: string): SheetsTestResult => ({ ok: false, main: { ok: false, message } })
      if (!saJson) return mainFail('Service Account JSON не збережено')
      if (!spreadsheetId) return mainFail('Spreadsheet ID не збережено')
      let sa: ServiceAccount
      try {
        sa = JSON.parse(saJson) as ServiceAccount
      } catch {
        return mainFail('Service Account JSON має некоректний формат (не вдалося розпарсити)')
      }
      if (!sa.client_email || !sa.private_key) {
        return mainFail('Service Account JSON не містить client_email або private_key')
      }
      let accessToken: string
      try {
        accessToken = await getAccessToken(sa)
      } catch (e) {
        return mainFail(`Не вдалося отримати access token: ${e instanceof Error ? e.message : String(e)}`)
      }
      const main = await fetchSheetTitle(spreadsheetId, accessToken)
      if (!main.ok) return mainFail(main.message)
      // Best-effort: phone_number (C) і event_time (G) як TEXT.
      const mainFormatted = await ensureTextColumns(accessToken, spreadsheetId, [2, 6])

      // ── Таблиця корекцій (окрема, той самий service account) ──
      let adjustments: Extract<SheetsTestResult, { ok: true }>['adjustments']
      const adjustmentsId = await config.get('google_adjustments_spreadsheet_id')
      if (!adjustmentsId) {
        adjustments = { status: 'not_configured' }
      } else {
        const access = await accessFor('google_adjustments_spreadsheet_id')
        if (!access) {
          adjustments = { status: 'error', message: 'Service Account JSON не збережено або має некоректний формат' }
        } else {
          const res = await fetchSheetTitle(access.spreadsheetId, access.accessToken)
          if (!res.ok) {
            adjustments = { status: 'error', message: res.message }
          } else {
            const formatted = await ensureTextColumns(access.accessToken, access.spreadsheetId, [2])
            adjustments = { status: 'ok', title: res.title, formatted }
          }
        }
      }

      return { ok: true, main: { ok: true, title: main.title, formatted: mainFormatted }, adjustments }
    },
  }
}
