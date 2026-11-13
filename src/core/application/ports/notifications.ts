// core/application/ports/notifications — каналы уведомлений о заявке (Telegram, KeyCRM, email).
import type { UtmData } from '../../domain/lead/utm'
import type { ReferralNote } from '../../domain/referral/link-rules'

/** Данные заявки для уведомления (без PII-логирования в адаптерах). */
export type LeadNotification = {
  name: string
  phone: string
  email?: string
  service?: string
  comment?: string
  utm?: UtmData
  /** URL страницы заявки. */
  source?: string
  /** Реферальный код/партнёр (отклонение 11): active — зачтено, inactive/unknown — только код. */
  referral?: ReferralNote
}

export type NotifyResult = { ok: boolean; error?: string }

export interface LeadNotifier {
  send(lead: LeadNotification, options?: { isRepeat?: boolean }): Promise<NotifyResult>
}

export type TestMessage = { ok: boolean; message: string }

/** «Перевірити підключення» для ключей интеграций. */
export interface IntegrationTester {
  telegram(botToken: string): Promise<TestMessage>
  keycrm(apiKey: string): Promise<TestMessage>
  smtp(args: { user: string; password: string; from: string; to: string }): Promise<TestMessage>
}
