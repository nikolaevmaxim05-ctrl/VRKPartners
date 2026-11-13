// use-cases/public/submit-lead — приёмник заявок с лендинга. Порядок раздела 8 стандарта:
//   1. Zod → 400;  2. honeypot → фейковый успех;  3. rate limit по таблице leads
//   (3 заявки / 10 мин с одного IP; ошибка подсчёта НЕ блокирует) → 429;  (капчи нет —
//   отклонение 4);  5. нормализация (телефон E.164 в Zod, email trim+lowercase);
//   6. дедуп по телефону/IP → комментарий к оригиналу, уведомление «повтор», новый лид не
//   создаётся;  7. запись лида в начальную стадию;  8. уведомления Telegram / KeyCRM / email —
//   Promise.allSettled, ошибки запрос не валят. Решение владельца (Фаза 4): при отказе БД
//   уведомления всё равно отправляются — 500 «DB error» только если упали и БД, и все каналы.
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
import { collectReferralTouches } from '../../../domain/referral/attribution'
import { pickReferralTouch, parseAttributionDays, REF_ATTRIBUTION_SETTING_KEY, type ReferralTouch } from '../../../domain/referral/touches'
import type { ReferralNote } from '../../../domain/referral/link-rules'
import type { ReferralLinkRepository } from '../../ports/referrals'

/** Rate limit формы: не больше 3 заявок с одного IP за 10 минут (раздел 8). */
export const LEAD_RATE_LIMIT = { max: 3, windowMs: 10 * 60 * 1000 } as const

/** Язык по умолчанию для leads.locale (профиль A). */
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
  /** Байпас лимита для тестов вне production (RATE_LIMIT_DISABLED=1). */
  rateLimitBypass?: () => boolean
  /** Реферальные ссылки (отклонение 11); без репозитория код только сохраняется в referral_code. */
  referrals?: Pick<ReferralLinkRepository, 'findByCode'>
}

/** ip — из цепочки заголовков (раздел 8); 'unknown' = не определён (лимит и дедуп по IP пропускаются). */
export type SubmitLeadContext = {
  ip: string
  userAgent: string | null
  /** Значение cookie lead_ref (HttpOnly, список касаний; ставит middleware) или null. */
  referralCookie?: string | null
}

export type SubmitLeadValue = { duplicate: boolean }

/** Стадия по умолчанию, если ни одна не помечена is_initial. */
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

  /** true = лимит превышен. Ошибка подсчёта → false (заявку не блокируем), только лог. */
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

  /** Окно атрибуции (дней) из site_settings; ошибка/отсутствие → дефолт 90, заявку не блокирует. */
  async function getAttributionDays(): Promise<number> {
    try {
      const res = await settings.getMany([REF_ATTRIBUTION_SETTING_KEY])
      if (!res.ok) {
        console.error('[lead] referral_window_settings_failed (дефолт)', res.error)
        return parseAttributionDays(null)
      }
      return parseAttributionDays(res.data.get(REF_ATTRIBUTION_SETTING_KEY))
    } catch (err) {
      console.error('[lead] referral_window_settings_threw (дефолт)', err instanceof Error ? err.message : err)
      return parseAttributionDays(null)
    }
  }

  /**
   * Реферал (first-touch): касания cookie ⊕ тело ⊕ ?ref страницы → самое раннее в окне атрибуции;
   * активная ссылка зачитывается (id), неактивная или неизвестная — только код (решение владельца 2);
   * все касания вне окна → заявка органическая (решение 2026-09-29). Ошибка поиска заявку не блокирует.
   */
  async function resolveReferral(touch: ReferralTouch | null): Promise<{ linkId: string | null; note: ReferralNote | undefined; touchedAt: string | null }> {
    if (!touch) return { linkId: null, note: undefined, touchedAt: null }
    const touchedAt = new Date(touch.at * 1000).toISOString()
    const code = touch.code
    let note: ReferralNote = { code, name: null, state: 'unknown', touchedAt }
    if (!deps.referrals) return { linkId: null, note, touchedAt }
    try {
      const r = await deps.referrals.findByCode(code)
      if (!r.ok) console.error('[lead] referral_lookup_failed (без привʼязки)', r.error)
      else if (r.data) {
        note = { code, name: r.data.name, state: r.data.is_active ? 'active' : 'inactive', touchedAt }
        return { linkId: r.data.is_active ? r.data.id : null, note, touchedAt }
      }
    } catch (err) {
      console.error('[lead] referral_lookup_threw (без привʼязки)', err instanceof Error ? err.message : err)
    }
    return { linkId: null, note, touchedAt }
  }

  /** Запись лида; исключения адаптера → ошибка (а не 500 без тела). */
  async function insertLead(row: LeadInsert): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const saved = await leads.insert(row)
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

    // 2. Honeypot: бот заполнил скрытое поле `company` — фейковый успех (бот не узнает).
    if (isHoneypotFilled(lead)) return ok({ duplicate: false })

    const ip = ctx.ip && ctx.ip !== 'unknown' ? ctx.ip : null

    // 3. Rate limit по таблице leads (считаются только сохранённые валидные заявки).
    if (ip) {
      if (await isRateLimited(ip)) {
        const retryAfter = Math.ceil(LEAD_RATE_LIMIT.windowMs / 1000)
        console.warn(`[lead] rate_limited: >${LEAD_RATE_LIMIT.max} за ${retryAfter}s`)
        return fail('rate_limited', 'Too many requests', { retryAfter })
      }
    } else {
      console.warn('[lead] rate_limit_skipped: клієнтський IP не визначено із заголовків')
    }

    // 4. Реферал — СТРОГО после honeypot и лимита (боты не ходят в БД), до дедупа (для «[ПОВТОР]»):
    //    касания из всех источников → самое раннее в окне атрибуции (first-touch) → поиск ссылки.
    const nowSec = Math.floor(clock.now().getTime() / 1000)
    const touches = collectReferralTouches({ cookie: ctx.referralCookie, body: lead.refTouches, legacyBody: lead.ref, pageUrl: lead.page }, nowSec)
    const touch = touches.length > 0 ? pickReferralTouch(touches, { windowDays: await getAttributionDays(), now: nowSec }) : null
    const referral = await resolveReferral(touch)

    // 5. Нормализация: телефон уже E.164 (Zod transform), email — trim + lowercase.
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
      referral: referral.note,
    }

    // Ключи всех каналов доставки — одним запросом в кэш.
    await deps.integrationConfig.prefetch(LEAD_DELIVERY_KEYS)

    // 6. Дедуп: оригинал маркируется is_repeat + system-комментарий, Telegram с [ПОВТОР].
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
            referral: referral.note ?? null,
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

    // 7. Запись лида в начальную стадию — ДО уведомлений; ошибка БД → 500.
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
      // 'unknown' в БД не пишем: колонка inet → NULL (отклонение 10).
      ip_address: ip,
      user_agent: ctx.userAgent,
      status_id: statusId,
      locale: lead.locale || DEFAULT_LEAD_LOCALE,
      referral_link_id: referral.linkId,
      referral_code: touch?.code ?? null,
      referral_touched_at: referral.touchedAt,
    }
    const saved = await insertLead(row)
    if (saved.ok) console.log('[lead] channel_ok channel=supabase')
    else console.error('[lead] supabase_failed', saved.error)

    // 8. Уведомления — все каналы параллельно, ошибки только в лог. Идут и при отказе БД
    // (менеджер должен увидеть заявку), поэтому лид в Telegram может существовать без строки в CRM.
    const channelNames = ['telegram', 'keycrm', 'email'] as const
    const results = await Promise.allSettled([
      notifiers.telegram.send(leadData),
      notifiers.keycrm.send(leadData),
      notifiers.email.send(leadData),
    ])
    let delivered = 0
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.ok) {
        delivered++
        console.log(`[lead] channel_ok channel=${channelNames[i]}`)
      } else if (result.status === 'fulfilled') console.error(`[lead] integration_failed:${channelNames[i]}`, result.value.error)
      else console.error(`[lead] integration_threw:${channelNames[i]}`, result.reason)
    })

    if (!saved.ok && delivered === 0) {
      console.error('[lead] all_channels_failed')
      return fail('failed', 'DB error')
    }
    return ok({ duplicate: false })
  }
}
