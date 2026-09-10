// use-cases/admin/verify-ga4 — dev-перевірка доставки подій у GA4 (Dev tools → крок 2).
// Відхилення 8 (AGENTS.md). Відповідь завжди 200 JSON: { configured, points? , error? }.
import type { Ga4Client, Ga4Env } from '../../ports/system'
import {
  ANALYTICS_REGISTRY,
  resolveAnalyticsEvent,
  type AnalyticsEventsConfig,
} from '../../../domain/analytics/registry'

export type Ga4Point = { key: string; block: string; label: string; names: string[]; enabled: boolean; arrived: boolean }

export type Ga4VerifyResult =
  | { configured: false }
  | { configured: true; error: string }
  | { configured: true; points: Ga4Point[] }

export function makeVerifyGa4(deps: {
  ga4: Ga4Client
  env: () => Ga4Env
  loadConfig: () => Promise<AnalyticsEventsConfig>
  sleep: (ms: number) => Promise<void>
  now: () => number
}) {
  return async function verifyGa4(): Promise<Ga4VerifyResult> {
    const env = deps.env()
    const required: Record<string, string | undefined> = {
      GA4_MEASUREMENT_ID: env.measurementId,
      GA4_API_SECRET: env.apiSecret,
      GA4_PROPERTY_ID: env.propertyId,
      GA4_SA_JSON: env.serviceAccountJson,
    }
    const missing = Object.entries(required).filter(([, v]) => !v || !String(v).trim()).map(([k]) => k)

    // Жодної змінної — «не налаштовано» (UI покаже інструкцію).
    if (missing.length === Object.keys(required).length) return { configured: false }
    if (missing.length > 0) {
      return {
        configured: true,
        error: `Середовище не бачить: ${missing.join(', ')}. Перевірте точні назви, оточення Production і зробіть свіжий redeploy (не з кешу старого білда).`,
      }
    }
    const { measurementId, apiSecret, propertyId, serviceAccountJson } = env
    if (!measurementId || !apiSecret || !propertyId || !serviceAccountJson) return { configured: false }

    const config = await deps.loadConfig()
    const points: Ga4Point[] = ANALYTICS_REGISTRY.map((entry) => {
      const r = resolveAnalyticsEvent(entry.key, config)
      return { key: entry.key, block: entry.blockLabel, label: entry.interactionLabel, names: r.eventNames, enabled: r.enabled, arrived: false }
    })
    const enabledNames = [...new Set(points.filter((p) => p.enabled).flatMap((p) => p.names))].filter((n) => n.length > 0)
    if (enabledNames.length === 0) return { configured: true, points }

    try {
      let sa: { client_email: string; private_key: string }
      try {
        sa = JSON.parse(serviceAccountJson)
        if (!sa.client_email || !sa.private_key) throw new Error('missing fields')
      } catch {
        return { configured: true, error: 'GA4_SA_JSON не є валідним JSON сервіс-акаунта (потрібні client_email і private_key).' }
      }

      await deps.ga4.sendTestEvents(measurementId, apiSecret, enabledNames)
      const token = await deps.ga4.getAccessToken(sa)
      const seen = new Set<string>()
      const deadline = deps.now() + 45_000
      await deps.sleep(3_000) // пауза, щоб MP-хіт встиг зареєструватись
      while (deps.now() < deadline) {
        const names = await deps.ga4.fetchRealtimeEventNames(token, propertyId)
        names.forEach((n) => seen.add(n))
        if (enabledNames.every((n) => seen.has(n))) break
        await deps.sleep(5_000)
      }
      for (const p of points) p.arrived = p.enabled && p.names.length > 0 && p.names.every((n) => seen.has(n))
      return { configured: true, points }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка'
      console.error('[ga4-arrival] failed', message)
      return { configured: true, error: message }
    }
  }
}
