// POST /api/admin/dev/ga4-arrival
// Реальна перевірка доставки подій у GA4 (Dev tools → крок 2):
//   1) шле тестові події через Measurement Protocol (GA4_MEASUREMENT_ID + GA4_API_SECRET);
//   2) опитує Realtime-звіт через GA4 Data API (сервіс-акаунт GA4_SA_JSON, property GA4_PROPERTY_ID)
//      і повертає, які імена подій уже «дійшли».
//
// Якщо env не налаштовано — повертаємо { configured: false }, UI показує інструкцію.
// Аутентифікація сервіс-акаунта — на нативному crypto (без зовнішніх залежностей).
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import {
  ANALYTICS_REGISTRY,
  resolveAnalyticsEvent,
  parseAnalyticsEventsConfig,
  getDefaultAnalyticsEvents,
  ANALYTICS_EVENTS_SETTING_KEY,
  type AnalyticsEventsConfig,
} from '@/lib/analytics-registry'

export const runtime = 'nodejs'
// Realtime інколи оновлюється до ~1 хв — потрібен довший ліміт (Vercel Pro: до 300с).
export const maxDuration = 60

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ServiceAccount = { client_email: string; private_key: string }

/** Поточний конфіг подій (дефолти + збережені оверрайди), як у marketing/layout. */
async function loadConfig(): Promise<AnalyticsEventsConfig> {
  try {
    const service = createServiceClient()
    const { data } = await service
      .from('site_settings')
      .select('value')
      .eq('key', ANALYTICS_EVENTS_SETTING_KEY)
      .maybeSingle()
    const stored = data?.value ? parseAnalyticsEventsConfig(JSON.parse(data.value)) : {}
    return { ...getDefaultAnalyticsEvents(), ...stored }
  } catch {
    return getDefaultAnalyticsEvents()
  }
}

/** base64url для рядків/буферів. */
function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

/** OAuth2 access token для сервіс-акаунта (JWT-bearer, RS256). */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(sa.private_key)
    .toString('base64url')
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const j = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!j.access_token) {
    throw new Error(`OAuth: ${j.error_description || j.error || 'не отримано access_token'}`)
  }
  return j.access_token
}

/** Множина імен подій із Realtime-звіту (dimension eventName). */
async function fetchRealtimeEventNames(token: string, propertyId: string): Promise<Set<string>> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        limit: 250,
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Realtime API ${res.status}: ${text.slice(0, 240)}`)
  }
  const j = (await res.json()) as {
    rows?: Array<{ dimensionValues?: Array<{ value?: string }> }>
  }
  const names = new Set<string>()
  for (const row of j.rows ?? []) {
    const v = row.dimensionValues?.[0]?.value
    if (typeof v === 'string') names.add(v)
  }
  return names
}

/** Відправка тестових подій через Measurement Protocol (батчами ≤25). */
async function sendMeasurementProtocol(
  measurementId: string,
  apiSecret: string,
  eventNames: string[],
): Promise<void> {
  const clientId = `${Date.now()}.${Math.floor(Math.random() * 1e9)}`
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`

  for (let i = 0; i < eventNames.length; i += 25) {
    const batch = eventNames.slice(i, i + 25)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: batch.map((name) => ({ name, params: { debug_devtools: 1 } })),
      }),
    })
  }
}

export async function POST() {
  // Auth: доступ як у налаштувань аналітики
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_settings', 'view_reports']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const measurementId = process.env.GA4_MEASUREMENT_ID
  const apiSecret = process.env.GA4_API_SECRET
  const propertyId = process.env.GA4_PROPERTY_ID
  const saRaw = process.env.GA4_SA_JSON

  // Не налаштовано — UI покаже інструкцію (не помилка).
  if (!measurementId || !apiSecret || !propertyId || !saRaw) {
    return NextResponse.json({ configured: false })
  }

  // Точки з реєстру під поточним конфігом.
  const config = await loadConfig()
  const points = ANALYTICS_REGISTRY.map((entry) => {
    const r = resolveAnalyticsEvent(entry.key, config)
    return {
      key: entry.key,
      block: entry.blockLabel,
      label: entry.interactionLabel,
      names: r.eventNames,
      enabled: r.enabled,
      arrived: false,
    }
  })

  const enabledNames = [
    ...new Set(points.filter((p) => p.enabled).flatMap((p) => p.names)),
  ].filter((n) => n.length > 0)

  if (enabledNames.length === 0) {
    return NextResponse.json({ configured: true, points })
  }

  try {
    let sa: ServiceAccount
    try {
      sa = JSON.parse(saRaw) as ServiceAccount
      if (!sa.client_email || !sa.private_key) throw new Error('missing fields')
    } catch {
      return NextResponse.json({
        configured: true,
        error: 'GA4_SA_JSON не є валідним JSON сервіс-акаунта (потрібні client_email і private_key).',
      })
    }

    // 1) Відправляємо тестові події.
    await sendMeasurementProtocol(measurementId, apiSecret, enabledNames)

    // 2) Токен + опитування Realtime до появи всіх імен або таймауту.
    const token = await getAccessToken(sa)
    const seen = new Set<string>()
    const deadline = Date.now() + 45_000
    // невелика пауза, щоб MP-хіт встиг зареєструватись
    await sleep(3_000)
    while (Date.now() < deadline) {
      const names = await fetchRealtimeEventNames(token, propertyId)
      names.forEach((n) => seen.add(n))
      if (enabledNames.every((n) => seen.has(n))) break
      await sleep(5_000)
    }

    for (const p of points) {
      p.arrived = p.enabled && p.names.length > 0 && p.names.every((n) => seen.has(n))
    }

    return NextResponse.json({ configured: true, points })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Невідома помилка'
    console.error('[ga4-arrival] failed', message)
    return NextResponse.json({ configured: true, error: message })
  }
}
