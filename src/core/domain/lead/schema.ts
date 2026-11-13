// core/domain/lead/schema — Zod-схема заявки (раздел 8). Ядро использует zod
// (разрешённое исключение 3). Используется и на клиенте (LeadForm), и на сервере (submit-lead).
//
// Тексты ошибок приходят параметром из текстов сайта (messages.form.*) — ядро не знает о
// языке, а клиент редактирует их из админки. Поля формы: имя + телефон (+ honeypot `company`);
// email/service/comment — необязательные (форма их не показывает, API принимает).
import { z } from 'zod'
import { normalizeRefCode } from '../referral/code'
import { normalizeTouches } from '../referral/touches'
import { normalizePhone } from './phone'

export type LeadSchemaMessages = {
  errorNameMin: string
  errorNameMax: string
  errorNameLetters: string
  errorPhoneRequired: string
  errorPhoneIncomplete: string
  errorEmailInvalid: string
}

export function makeLeadSchema(t: LeadSchemaMessages) {
  const name = z
    .string()
    .trim()
    .min(2, t.errorNameMin)
    .max(60, t.errorNameMax)
    .regex(/^[A-Za-zА-Яа-яЁёЇїІіЄєҐґ'’\s-]+$/u, t.errorNameLetters)

  /** Телефон: принимаем маску +380 (XX) XXX-XX-XX (12 цифр), нормализуем в E.164. */
  const phone = z
    .string()
    .trim()
    .min(1, t.errorPhoneRequired)
    .refine((v) => v.replace(/\D/g, '').length === 12, t.errorPhoneIncomplete)
    .transform(normalizePhone)

  /** Email — необязательный (форма VRK его не показывает, но API принимает). */
  const email = z
    .string()
    .trim()
    .max(254)
    .refine((v) => !v || z.string().email().safeParse(v).success, { message: t.errorEmailInvalid })
    .optional()
    .or(z.literal(''))

  return z.object({
    name,
    phone,
    email,
    // код услуги / метка источника (≤ 50, раздел 8)
    service: z.string().trim().max(50).optional().or(z.literal('')),
    comment: z.string().trim().max(500).optional().or(z.literal('')),
    // тип формы / контекст блока для аналитики (hero, audit, final, header…)
    source: z.string().max(60).optional(),
    // Honeypot `company`: принимаем любую строку — заполненное поле обрабатывает сценарий
    // (фейковый успех ПОСЛЕ Zod, раздел 8), а не 400.
    company: z.string().max(200).optional(),
    // UTM-метки / click-id / referrer — из sessionStorage клиента (необязательные).
    utm: z
      .object({
        utm_source: z.string().max(255).optional(),
        utm_medium: z.string().max(255).optional(),
        utm_campaign: z.string().max(255).optional(),
        utm_term: z.string().max(255).optional(),
        utm_content: z.string().max(255).optional(),
        gclid: z.string().max(512).optional(),
        fbclid: z.string().max(512).optional(),
        ttclid: z.string().max(512).optional(),
        referrer: z.string().max(2048).optional(),
      })
      .optional(),
    // URL страницы, с которой отправлена заявка (window.location.href)
    page: z.string().max(2048).optional(),
    // Язык страницы (leads.locale)
    locale: z.string().max(10).optional(),
    // Легаси-поле реферального кода (клиенты со старым бандлом): невалидный → undefined, никогда не 400.
    ref: z.unknown().optional().transform((v) => normalizeRefCode(v) ?? undefined),
    // Касания партнёрских ссылок (зеркало localStorage): ≤ 8 валидных { code, at }, остальные
    // отбрасываются молча; поле никогда не даёт 400 (без него Zod-strip потерял бы тело).
    refTouches: z.unknown().optional().transform((v) => (v === undefined ? undefined : normalizeTouches(v))),
  })
}

export type LeadSchema = ReturnType<typeof makeLeadSchema>
export type LeadInput = z.infer<LeadSchema>

export type LeadUtm = NonNullable<LeadInput['utm']>

export const leadDefaults: LeadInput = {
  name: '',
  phone: '',
  email: '',
  service: '',
  comment: '',
  source: '',
  company: '',
}
