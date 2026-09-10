// infrastructure/integrations/ga4 — dev-інструмент перевірки доставки подій у GA4
// (відхилення 8, AGENTS.md): Measurement Protocol + Realtime Data API, auth — сервіс-акаунт (RS256).
import crypto from 'node:crypto'
import type { Ga4Client } from '@core/application/ports/system'

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url')

export const ga4Client: Ga4Client = {
  async sendTestEvents(measurementId, apiSecret, eventNames) {
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
  },

  async getAccessToken(sa) {
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
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    })
    const j = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
    if (!j.access_token) throw new Error(`OAuth: ${j.error_description || j.error || 'не отримано access_token'}`)
    return j.access_token
  },

  async fetchRealtimeEventNames(token, propertyId) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 250 }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Realtime API ${res.status}: ${text.slice(0, 240)}`)
    }
    const j = (await res.json()) as { rows?: Array<{ dimensionValues?: Array<{ value?: string }> }> }
    const names = new Set<string>()
    for (const row of j.rows ?? []) {
      const v = row.dimensionValues?.[0]?.value
      if (typeof v === 'string') names.add(v)
    }
    return names
  },
}
