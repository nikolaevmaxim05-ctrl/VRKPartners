// core/application/ports/system — keepalive, GA4 dev-перевірка.
// Rate limit форми — підрахунок по таблиці leads (LeadRepository.countByIpSince), окремого порту немає.
import type { DbResult } from './common'

export interface HealthCheck {
  ping(): Promise<DbResult<void>>
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
