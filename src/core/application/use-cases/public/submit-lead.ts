// use-cases/public/submit-lead — приймач заявок з лендингу. Порядок розділу 8 стандарту:
//   1. Zod → 400;  2. honeypot → фейковий успіх;  3. rate limit по таблиці leads
//   (3 заявки / 10 хв з одного IP; помилка підрахунку НЕ блокує) → 429;  (капчі немає —
//   відхилення 4);  5. нормалізація (телефон E.164 у Zod, email trim+lowercase);
//   6. дедуп за телефоном/IP → коментар до оригіналу, сповіщення «повтор», новий лід не
//   створюється;  7. запис ліда в початкову стадію → 500 при помилці БД;
//   8. сповіщення Telegram / KeyCRM / email — Promise.allSettled, помилки запит не валять.
import { ok, fail, type Result } from '../../result'
import type { Clock } from '../../ports/common'
import type { LeadRepository, LeadStatusRepository, LeadCommentRepository, LeadInsert } from '../../ports/leads'
import type { SettingsRepository, IntegrationConfig } from '../../ports/settings'
import type { LeadNotifier, LeadNotification } from '../../ports/notifications'
import type { LeadSchema } from '../../../domain/lead/schema'
import { normalizeEmail } from '../../../domain/lead/email'
import { buildLeadMessage, isHoneypotFilled } from '../../../domain/lead/message'
import {
  DEFAULT_DEDUP_SETTINGS,
  parseDedupSettings,
  buildRepeatComment,
  type DedupSettings,
  type DedupReason,
} from '../../../domain/lead/dedup'
import { LEAD_DELIVERY_KEYS } from '../../../domain/integrations/keys'

/** Rate limit форми: не більше 3 заявок з одного IP за 10 хвилин (розділ 8). */
export const LEAD_RATE_LIMIT = { max: 3, windowMs: 10 * 60 * 1000 } as const

/** Мова за замовчуванням для leads.locale (профіль A). */
export const DEFAULT_LEAD_LOCALE = 'uk'

export type SubmitLeadDeps = {
  schema: LeadSchema
  integrationConfig: IntegrationConfig
  leads: LeadRepository
  statuses: LeadStatusRepository
  comments: LeadCommentRepository
  settings: SettingsRepository
  notifiers: { telegram: LeadNotifier; keycrm: LeadNotifier; email: LeadNotifier }
  clock: Clock
  /** Байпас ліміту для тестів поза production (RATE_LIMIT_DISABLED=1). */
  rateLimitBypass?: () => boolean
}

/** ip — з ланцюжка заголовків (розділ 8); 'unknown' = не визначено (ліміт і дедуп за IP пропускаються). */
export type SubmitLeadContext = { ip: string; userAgent: string | null }

export type SubmitLeadValue = { duplicate: boolean }

/** Стадія за замовчуванням, якщо жодна не позначена is_initial. */
const FALLBACK_INITIAL_STAGE_NAME = 'Новий клієнт'

export function makeSubmitLead(deps: SubmitLeadDeps) {
  const { schema, leads, statuses, comments, settings, notifiers, clock } = deps

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
      const r = await leads.findFirstIdByPhone(phone)
      if (!r.ok) console.error('[dedup] phone_lookup_failed', r.error)
      else if (r.data) return { id: r.data, reason: 'phone' }
    }
    if (s.dedupByIp && ip) {
      const since = new Date(clock.now().getTime() - s.ipWindowHours * 3600 * 1000).toISOString()
      const r = await leads.findFirstIdByIpSince(ip, since)
      if (!r.ok) console.error('[dedup] ip_lookup_failed', r.error)
      else if (r.data) return { id: r.data, reason: 'ip' }
    }
    return null
  }

  /** true = ліміт перевищено. Помилка підрахунку → false (заявку не блокуємо), лише лог. */
  async function isRateLimited(ip: string): Promise<boolean> {
    if (deps.rateLimitBypass?.()) return false
    const since = new Date(clock.now().getTime() - LEAD_RATE_LIMIT.windowMs).toISOString()
    try {
      const r = await leads.countByIpSince(ip, since)
      if (!r.ok) {
        console.error('[lead] rate_limit_count_failed (не блокуємо)', r.error)
        return false
      }
      return r.data >= LEAD_RATE_LIMIT.max
    } catch (err) {
      console.error('[lead] rate_limit_count_threw (не блокуємо)', err)
      return false
    }
  }

  /** Запис ліда; винятки адаптера → помилка (а не 500 без тіла). */
  async function insertLead(row: LeadInsert): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      let saved = await leads.insert(row)
      if (!saved.ok && /locale/i.test(saved.error)) {
        // Перехідний захист: міграція 029 (колонка leads.locale) ще не застосована — лід важливіший.
        console.warn('[lead] insert_without_locale: застосуйте міграцію 029_leads_locale_ip_index.sql')
        const { locale: _locale, ...withoutLocale } = row
        saved = await leads.insert(withoutLocale)
      }
      return saved.ok ? { ok: true } : { ok: false, error: saved.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return async function submitLead(body: unknown, ctx: SubmitLeadContext): Promise<Result<SubmitLeadValue>> {
    // 1. Zod
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('invalid', 'Invalid data')
    const lead = parsed.data

    // 2. Honeypot: бот заповнив приховане поле `company` — фейковий успіх (бот не дізнається).
    if (isHoneypotFilled(lead)) return ok({ duplicate: false })

    const ip = ctx.ip && ctx.ip !== 'unknown' ? ctx.ip : null

    // 3. Rate limit по таблиці leads (рахуються лише збережені валідні заявки).
    if (ip) {
      if (await isRateLimited(ip)) {
        const retryAfter = Math.ceil(LEAD_RATE_LIMIT.windowMs / 1000)
        console.warn(`[lead] rate_limited: >${LEAD_RATE_LIMIT.max} за ${retryAfter}s`)
        return fail('rate_limited', 'Too many requests', { retryAfter })
      }
    } else {
      console.warn('[lead] rate_limit_skipped: клієнтський IP не визначено із заголовків')
    }

    // 5. Нормалізація: телефон уже E.164 (Zod transform), email — trim + lowercase.
    const email = lead.email ? normalizeEmail(lead.email) : null
    const message = buildLeadMessage(lead)
    const leadData: LeadNotification = {
      name: lead.name,
      phone: lead.phone,
      email: email || undefined,
      service: lead.service || undefined,
      comment: message ?? undefined,
      utm: lead.utm,
      source: lead.page || undefined,
    }

    // Ключі всіх каналів доставки — одним запитом у кеш.
    await deps.integrationConfig.prefetch(LEAD_DELIVERY_KEYS)

    // 6. Дедуп: оригінал маркується is_repeat + system-коментар, Telegram з [ПОВТОР].
    const dup = await findDuplicate(lead.phone, ip)
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

    // 7. Запис ліда в початкову стадію — ДО сповіщень; помилка БД → 500.
    const statusId = (await statuses.findInitialId()) ?? (await statuses.findIdByName(FALLBACK_INITIAL_STAGE_NAME))
    const row: LeadInsert = {
      name: lead.name,
      phone: lead.phone,
      email,
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
      // 'unknown' у БД не пишемо: колонка inet → NULL (відхилення 10).
      ip_address: ip,
      user_agent: ctx.userAgent,
      status_id: statusId,
      locale: lead.locale || DEFAULT_LEAD_LOCALE,
    }
    const saved = await insertLead(row)
    if (!saved.ok) {
      console.error('[lead] supabase_failed', saved.error)
      return fail('failed', 'DB error')
    }
    console.log('[lead] channel_ok channel=supabase')

    // 8. Сповіщення — усі канали паралельно, помилки лише в лог.
    const channelNames = ['telegram', 'keycrm', 'email'] as const
    const results = await Promise.allSettled([
      notifiers.telegram.send(leadData),
      notifiers.keycrm.send(leadData),
      notifiers.email.send(leadData),
    ])
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.ok) console.log(`[lead] channel_ok channel=${channelNames[i]}`)
      else if (result.status === 'fulfilled') console.error(`[lead] integration_failed:${channelNames[i]}`, result.value.error)
      else console.error(`[lead] integration_threw:${channelNames[i]}`, result.reason)
    })

    return ok({ duplicate: false })
  }
}
