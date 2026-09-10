// LEGACY-адаптер (Фаза 1): правила дедупу — у @core/domain/lead/dedup; тут запити до БД
// (Фаза 2 → порт LeadRepository.findDuplicate + use-case submit-lead).
//
// Логіка: дубль = лід з тим самим phone (нормалізованим) АБО з тим самим ip в межах
// вікна (за замовчуванням 24 год). При дублі новий лід НЕ створюється, оригінал
// маркається is_repeat=true, у lead_comments додається system-коментар.

import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@core/domain/lead/phone'
import {
  DEFAULT_DEDUP_SETTINGS,
  parseDedupSettings,
  buildRepeatComment,
  type DedupSettings,
  type RepeatPayload,
} from '@core/domain/lead/dedup'

export type { DedupSettings, RepeatPayload } from '@core/domain/lead/dedup'
// Нормалізація телефону — у ядрі (реекспорт для сумісності).
export { normalizePhone } from '@core/domain/lead/phone'

export async function getDedupSettings(): Promise<DedupSettings> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['dedup_by_phone', 'dedup_by_ip', 'dedup_ip_window_hours'])

  if (error) {
    console.error('[dedup] settings_failed', error.message)
    return DEFAULT_DEDUP_SETTINGS
  }

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]))
  return parseDedupSettings(map)
}

// ── Пошук дубля ──────────────────────────────────────────────────────────────
export type DedupResult =
  | { isDuplicate: false }
  | { isDuplicate: true; originalLeadId: string; reason: 'phone' | 'ip' }

export async function deduplicateLead(args: {
  phone: string
  ip: string | null
}): Promise<DedupResult> {
  const settings = await getDedupSettings()
  const supabase = createServiceClient()

  // 1. Дедуп по телефону — точне співпадіння нормалізованого номера
  if (settings.dedupByPhone) {
    const normalized = normalizePhone(args.phone)
    if (normalized) {
      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', normalized)
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) {
        console.error('[dedup] phone_lookup_failed', error.message)
      } else if (data && data.length > 0) {
        return { isDuplicate: true, originalLeadId: data[0].id as string, reason: 'phone' }
      }
    }
  }

  // 2. Дедуп по IP — у межах вікна (за замовчуванням 24 год)
  if (settings.dedupByIp && args.ip) {
    const windowMs = settings.ipWindowHours * 3600 * 1000
    const since = new Date(Date.now() - windowMs).toISOString()
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('ip_address', args.ip)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) {
      console.error('[dedup] ip_lookup_failed', error.message)
    } else if (data && data.length > 0) {
      return { isDuplicate: true, originalLeadId: data[0].id as string, reason: 'ip' }
    }
  }

  return { isDuplicate: false }
}

// ── Маркування оригіналу як has-repeats + system-коментар ────────────────────
export async function markAsRepeat(originalLeadId: string, payload: RepeatPayload): Promise<void> {
  const supabase = createServiceClient()

  const { error: updErr } = await supabase
    .from('leads')
    .update({ is_repeat: true })
    .eq('id', originalLeadId)
  if (updErr) {
    console.error('[dedup] mark_repeat_failed', updErr.message)
  }

  const { error: insErr } = await supabase.from('lead_comments').insert({
    lead_id: originalLeadId,
    user_id: null,
    user_email: null,
    type: 'system',
    content: buildRepeatComment(payload),
  })
  if (insErr) {
    console.error('[dedup] system_comment_failed', insErr.message)
  }
}
