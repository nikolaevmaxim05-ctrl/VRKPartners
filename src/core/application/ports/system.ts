// core/application/ports/system — rate limiter, keepalive, GA4 dev-перевірка.
import type { DbResult } from './common'

export type RateLimitResult =
  | { status: 'ok'; remaining: number; reset: number }
  | { status: 'limited'; remaining: number; reset: number }
  | { status: 'unavailable'; reason: 'db_error' }

export interface RateLimiter {
  check(identifier: string): Promise<RateLimitResult>
}

export interface HealthCheck {
  ping(): Promise<DbResult<void>>
  /** Прибирання старих лічильників rate-limit (таблиця rate_limits, до Фази 4). */
  cleanupRateLimits(cutoffIso: string): Promise<DbResult<void>>
}

/** GA4: Measurement Protocol + Realtime Data API (dev-інструмент). */
export interface Ga4Client {
  sendTestEvents(measurementId: string, apiSecret: string, eventNames: string[]): Promise<void>
  getAccessToken(serviceAccountJson: { client_email: string; private_key: string }): Promise<string>
  fetchRealtimeEventNames(token: string, propertyId: string): Promise<Set<string>>
}

export type Ga4Env = {
  measurementId: string | undefined
  apiSecret: string | undefined
  propertyId: string | undefined
  serviceAccountJson: string | undefined
}
