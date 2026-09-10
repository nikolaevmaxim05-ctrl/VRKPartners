// use-cases/public/submit-lead — приймач заявок з лендингу.
// Фаза 2: перенос БЕЗ зміни поведінки (порядок: honeypot → Zod → rate limit → дедуп →
// паралельно запис + сповіщення). Порядок розділу 8 стандарту — у Фазі 4.
import { ok, fail, type Result } from '../../result'
import type { Clock } from '../../ports/common'
import type { LeadRepository, LeadStatusRepository, LeadCommentRepository, LeadInsert } from '../../ports/leads'
import type { SettingsRepository, IntegrationConfig } from '../../ports/settings'
import type { LeadNotifier, LeadNotification } from '../../ports/notifications'
import type { RateLimiter } from '../../ports/system'
import { leadSchema } from '../../../domain/lead/schema'
import { normalizePhone } from '../../../domain/lead/phone'
import { buildLeadMessage, isHoneypotFilled } from '../../../domain/lead/message'
import {
  DEFAULT_DEDUP_SETTINGS,
  parseDedupSettings,
  buildRepeatComment,
  type DedupSettings,
  type DedupReason,
} from '../../../domain/lead/dedup'
import { LEAD_DELIVERY_KEYS } from '../../../domain/integrations/keys'

export type SubmitLeadDeps = {
  rateLimiter: RateLimiter
  integrationConfig: IntegrationConfig
  leads: LeadRepository
  statuses: LeadStatusRepository
  comments: LeadCommentRepository
  settings: SettingsRepository
  notifiers: { telegram: LeadNotifier; keycrm: LeadNotifier; email: LeadNotifier }
  clock: Clock
}

export type SubmitLeadContext = { ip: string | null; userAgent: string | null }

export type SubmitLeadValue = { duplicate: boolean }

/** Стадія за замовчуванням, якщо жодна не позначена is_initial. */
const FALLBACK_INITIAL_STAGE_NAME = 'Новий клієнт'

export function makeSubmitLead(deps: SubmitLeadDeps) {
  const { leads, statuses, comments, settings, notifiers, clock } = deps

  async function getDedupSettings(): Promise<DedupSettings> {
    const res = await settings.getMany(['dedup_by_phone', 'dedup_by_ip', 'dedup_ip_window_hours'])
    if (!res.ok) {
      console.error('[dedup] settings_failed', res.error)
      return DEFAULT_DEDUP_SETTINGS
    }
    return parseDedupSettings(res.data)
  }

  async function findDuplicate(phone: string, ip: string | null): Promise<{ id: string; reason: DedupReason } | null> {
    const s = await getDedupSettings()
    if (s.dedupByPhone) {
      const normalized = normalizePhone(phone)
      if (normalized) {
        const r = await leads.findFirstIdByPhone(normalized)
        if (!r.ok) console.error('[dedup] phone_lookup_failed', r.error)
        else if (r.data) return { id: r.data, reason: 'phone' }
      }
    }
    if (s.dedupByIp && ip) {
      const since = new Date(clock.now().getTime() - s.ipWindowHours * 3600 * 1000).toISOString()
      const r = await leads.findFirstIdByIpSince(ip, since)
      if (!r.ok) console.error('[dedup] ip_lookup_failed', r.error)
      else if (r.data) return { id: r.data, reason: 'ip' }
    }
    return null
  }

  return async function submitLead(body: unknown, ctx: SubmitLeadContext): Promise<Result<SubmitLeadValue>> {
    // 1. Honeypot: бот заповнив приховане поле `company` — тихий «успіх».
    if (isHoneypotFilled(body)) return ok({ duplicate: false })

    // 2. Zod
    const parsed = leadSchema.safeParse(body)
    if (!parsed.success) return fail('invalid', 'Невірні дані')
    const lead = parsed.data

    // 3. Rate limit — ПІСЛЯ honeypot + Zod (рахуємо лише валідні сабміти). IP невідомий → пропускаємо.
    if (ctx.ip) {
      const rl = await deps.rateLimiter.check(ctx.ip)
      if (rl.status === 'limited') {
        const retryAfter = Math.max(Math.ceil((rl.reset - clock.now().getTime()) / 1000), 1)
        console.warn(`[lead] rate_limited: перебір ліміту, retryAfter=${retryAfter}s`)
        return fail('rate_limited', 'Забагато запитів. Спробуйте пізніше.', { retryAfter })
      }
      if (rl.status === 'unavailable') {
        console.error(
          `[lead] rate_limit_unavailable reason=${rl.reason} — перевір доступність Supabase (SUPABASE_SERVICE_ROLE_KEY / функція check_rate_limit)`,
        )
        return fail('unavailable', 'Технічна помилка. Спробуйте за хвилину.')
      }
    } else {
      console.warn('[lead] rate_limit_skipped: клієнтський IP не визначено із заголовків')
    }

    // Ключі всіх каналів доставки — одним запитом у кеш.
    await deps.integrationConfig.prefetch(LEAD_DELIVERY_KEYS)

    const message = buildLeadMessage(lead)
    const leadData: LeadNotification = {
      name: lead.name,
      phone: lead.phone,
      email: lead.email || undefined,
      service: lead.service || undefined,
      comment: message ?? undefined,
      utm: lead.utm,
      source: lead.page || undefined,
    }

    // 4. Дедуп: оригінал маркується is_repeat + system-коментар, Telegram з [ПОВТОР].
    const dup = await findDuplicate(leadData.phone, ctx.ip)
    if (dup) {
      const mark = await leads.markRepeat(dup.id)
      if (!mark.ok) console.error('[dedup] mark_repeat_failed', mark.error)
      const note = await comments.insertMany([
        {
          lead_id: dup.id,
          user_id: null,
          user_email: null,
          type: 'system',
          content: buildRepeatComment({
            reason: dup.reason,
            service: leadData.service ?? null,
            message,
            utm: leadData.utm ?? null,
            source: leadData.source ?? null,
          }),
        },
      ])
      if (!note.ok) console.error('[dedup] system_comment_failed', note.error)

      const tg = await notifiers.telegram.send(leadData, { isRepeat: true })
      if (tg.ok) console.log('[lead] repeat_notified channel=telegram')
      else console.error('[lead] repeat_telegram_failed', tg.error)

      console.log(`[lead] duplicate_detected reason=${dup.reason} original_id=${dup.id}`)
      return ok({ duplicate: true })
    }

    // 5. Новий лід: запис у БД — рівноправний канал поруч зі сповіщеннями.
    async function saveLead(): Promise<{ ok: boolean; error?: string }> {
      try {
        const statusId = (await statuses.findInitialId()) ?? (await statuses.findIdByName(FALLBACK_INITIAL_STAGE_NAME))
        const row: LeadInsert = {
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          service: lead.service || null,
          message,
          utm_source: lead.utm?.utm_source ?? null,
          utm_medium: lead.utm?.utm_medium ?? null,
          utm_campaign: lead.utm?.utm_campaign ?? null,
          utm_term: lead.utm?.utm_term ?? null,
          utm_content: lead.utm?.utm_content ?? null,
          gclid: lead.utm?.gclid ?? null,
          fbclid: lead.utm?.fbclid ?? null,
          ttclid: lead.utm?.ttclid ?? null,
          referrer: lead.utm?.referrer ?? null,
          source_url: lead.page ?? null,
          ip_address: ctx.ip,
          user_agent: ctx.userAgent,
          status_id: statusId,
        }
        const res = await leads.insert(row)
        if (!res.ok) {
          console.error('[lead] supabase_failed', res.error)
          return { ok: false, error: res.error }
        }
        return { ok: true }
      } catch (e) {
        console.error('[lead] supabase_threw', e)
        return { ok: false, error: String(e) }
      }
    }

    const [telegramResult, keycrmResult, emailResult, supabaseResult] = await Promise.allSettled([
      notifiers.telegram.send(leadData),
      notifiers.keycrm.send(leadData),
      notifiers.email.send(leadData),
      saveLead(),
    ])

    const channelNames = ['telegram', 'keycrm', 'email'] as const
    let successCount = 0
    ;[telegramResult, keycrmResult, emailResult].forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount++
        console.log(`[lead] channel_ok channel=${channelNames[i]}`)
      } else if (result.status === 'fulfilled') {
        console.error(`[lead] integration_failed:${channelNames[i]}`, result.value.error)
      } else {
        console.error(`[lead] integration_threw:${channelNames[i]}`)
      }
    })

    if (supabaseResult.status === 'fulfilled' && supabaseResult.value.ok) {
      console.log('[lead] channel_ok channel=supabase')
      successCount++
    } else {
      console.error('[lead] supabase_issue', supabaseResult)
    }

    if (successCount === 0) {
      console.error('[lead] all_channels_failed')
      return fail('failed', 'Помилка сервера. Спробуйте пізніше або зателефонуйте нам.')
    }
    return ok({ duplicate: false })
  }
}
