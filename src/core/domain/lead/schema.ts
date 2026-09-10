// core/domain/lead/schema — Zod-схема заявки (раздел 8). Ядро використовує zod
// (дозволений виняток 3). Використовується і на клієнті (LeadForm), і на сервері.
//
// Поля форми — VRK; серверні розширення (email, utm/click-ids, page) — за схемою
// стандарту. Тексти помилок поки зашиті (uk-UA); у Фазі 3 стають параметром
// makeLeadSchema(messages).
import { z } from 'zod'
import { normalizePhone } from './phone'

const name = z
  .string()
  .trim()
  .min(2, "Вкажіть ім'я (мінімум 2 символи)")
  .max(60, "Занадто довге ім'я")
  .regex(/^[A-Za-zА-Яа-яЁёЇїІіЄєҐґ'’\s-]+$/u, "Ім'я може містити лише літери")

/** Телефон: приймаємо маску +380 (XX) XXX-XX-XX (12 цифр), нормалізуємо в E.164. */
const phone = z
  .string()
  .trim()
  .min(1, 'Вкажіть номер телефону')
  .refine((v) => v.replace(/\D/g, '').length === 12, 'Введіть повний номер телефону')
  .transform(normalizePhone)

const optionalUrl = z.string().trim().max(200).optional().or(z.literal(''))

const comment = z.string().trim().max(1000).optional().or(z.literal(''))

/** Honeypot: приховане поле `company`, яке заповнюють лише боти — має лишатися порожнім. */
const honeypot = z.literal('').optional()

/** Email — необов'язковий (форма VRK його не показує, але API приймає). */
const email = z
  .string()
  .trim()
  .max(254)
  .refine((v) => !v || z.string().email().safeParse(v).success, { message: 'Некоректний формат email' })
  .optional()
  .or(z.literal(''))

/** Базова заявка (перший екран, фінальна форма, поп-апи). */
export const leadSchema = z.object({
  name,
  phone,
  email,
  website: optionalUrl, // РЕАЛЬНЕ поле «Сайт / ніша бізнесу» (не honeypot!)
  comment,
  // тип форми / контекст блоку для аналітики (hero, audit, final, modal...)
  source: z.string().max(60).optional(),
  // додаткові поля окремих поп-апів
  adFormat: z.string().max(60).optional(),
  budget: z.string().max(60).optional(),
  service: z.string().max(60).optional(),
  goal: z.string().max(60).optional(),
  company: honeypot, // honeypot
  // UTM-мітки / click-id / referrer — з sessionStorage клієнта (необов'язкові).
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
  // URL сторінки, з якої надіслано заявку (window.location.href)
  page: z.string().max(2048).optional(),
})

export type LeadInput = z.infer<typeof leadSchema>

/** Аліас для інтеграцій адмінки (Telegram/KeyCRM/Email). */
export type LeadFormData = LeadInput

export type LeadUtm = NonNullable<z.infer<typeof leadSchema>['utm']>

export const leadDefaults: LeadInput = {
  name: '',
  phone: '',
  email: '',
  website: '',
  comment: '',
  source: '',
  adFormat: '',
  budget: '',
  service: '',
  goal: '',
  company: '',
}
