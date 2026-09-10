// core/application/ports/notifications — канали сповіщень про заявку (Telegram, KeyCRM, email).
import type { UtmData } from '../../domain/lead/utm'

/** Дані заявки для сповіщення (без PII-логування в адаптерах). */
export type LeadNotification = {
  name: string
  phone: string
  email?: string
  service?: string
  comment?: string
  utm?: UtmData
  /** URL сторінки заявки. */
  source?: string
}

export type NotifyResult = { ok: boolean; error?: string }

export interface LeadNotifier {
  send(lead: LeadNotification, options?: { isRepeat?: boolean }): Promise<NotifyResult>
}

export type TestMessage = { ok: boolean; message: string }

/** «Перевірити підключення» для ключів інтеграцій. */
export interface IntegrationTester {
  telegram(botToken: string): Promise<TestMessage>
  keycrm(apiKey: string): Promise<TestMessage>
  smtp(args: { user: string; password: string; from: string; to: string }): Promise<TestMessage>
}
