// core/domain/lead/dedup — правила дедуплікації заявок (раздел 8).
// Чиста частина: налаштування та текст system-коментаря про повтор.
// Пошук дубля в БД і маркування — в інфраструктурі/use-case.
import { describeReferral, type ReferralNote } from '../referral/link-rules'

export type DedupSettings = {
  dedupByPhone: boolean
  dedupByIp: boolean
  ipWindowHours: number
}

export const DEFAULT_DEDUP_SETTINGS: DedupSettings = {
  dedupByPhone: true,
  dedupByIp: true,
  ipWindowHours: 24,
}

/** Розбір значень site_settings (key → value) у налаштування дедупу. */
export function parseDedupSettings(map: Map<string, string | null>): DedupSettings {
  const hours = parseInt(map.get('dedup_ip_window_hours') ?? '24', 10)
  return {
    dedupByPhone: (map.get('dedup_by_phone') ?? 'true') === 'true',
    dedupByIp: (map.get('dedup_by_ip') ?? 'true') === 'true',
    ipWindowHours: Number.isFinite(hours) && hours > 0 ? hours : 24,
  }
}

export type DedupReason = 'phone' | 'ip'

export type RepeatPayload = {
  reason: DedupReason
  service?: string | null
  message?: string | null
  utm?: Record<string, string | undefined> | null
  source?: string | null
  referral?: ReferralNote | null
}

/** Текст system-коментаря до оригінального ліда про повторне звернення. */
export function buildRepeatComment(payload: RepeatPayload): string {
  const lines: string[] = ['[ПОВТОР] Нове повторне звернення']
  lines.push(`Причина дедупу: ${payload.reason === 'phone' ? 'телефон' : 'IP-адреса'}`)
  if (payload.service) lines.push(`Послуга: ${payload.service}`)
  if (payload.message) lines.push(`Повідомлення: ${payload.message}`)

  const utmPairs = Object.entries(payload.utm ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  )
  if (utmPairs.length > 0) {
    lines.push('UTM:')
    for (const [k, v] of utmPairs) lines.push(`• ${k}: ${v}`)
  }
  if (payload.source) lines.push(`Сторінка: ${payload.source}`)
  if (payload.referral) lines.push(describeReferral(payload.referral))
  return lines.join('\n')
}
