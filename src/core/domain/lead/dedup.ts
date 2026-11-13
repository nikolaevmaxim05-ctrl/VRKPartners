// core/domain/lead/dedup — правила дедупликации заявок (раздел 8).
// Чистая часть: настройки и текст system-комментария о повторе.
// Поиск дубля в БД и маркировка — в инфраструктуре/use-case.
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

/** Разбор значений site_settings (key → value) в настройки дедупа. */
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

/** Текст system-комментария к исходному лиду о повторном обращении. */
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
