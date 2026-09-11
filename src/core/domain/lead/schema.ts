// core/domain/lead/schema — Zod-схема заявки (розділ 8). Ядро використовує zod
// (дозволений виняток 3). Використовується і на клієнті (LeadForm), і на сервері (submit-lead).
//
// Тексти помилок приходять параметром із текстів сайту (messages.form.*) — ядро не знає про
// мову, а клієнт редагує їх з адмінки. Поля форми: імʼя + телефон (+ honeypot `company`);
// email/service/comment — необовʼязкові (форма їх не показує, API приймає).
import { z } from 'zod'
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

  /** Телефон: приймаємо маску +380 (XX) XXX-XX-XX (12 цифр), нормалізуємо в E.164. */
  const phone = z
    .string()
    .trim()
    .min(1, t.errorPhoneRequired)
    .refine((v) => v.replace(/\D/g, '').length === 12, t.errorPhoneIncomplete)
    .transform(normalizePhone)

  /** Email — необовʼязковий (форма VRK його не показує, але API приймає). */
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
    // код послуги / мітка джерела (≤ 50, розділ 8)
    service: z.string().trim().max(50).optional().or(z.literal('')),
    comment: z.string().trim().max(500).optional().or(z.literal('')),
    // тип форми / контекст блоку для аналітики (hero, audit, final, header…)
    source: z.string().max(60).optional(),
    // Honeypot `company`: приймаємо будь-який рядок — заповнене поле обробляє сценарій
    // (фейковий успіх ПІСЛЯ Zod, розділ 8), а не 400.
    company: z.string().max(200).optional(),
    // UTM-мітки / click-id / referrer — з sessionStorage клієнта (необовʼязкові).
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
    // Мова сторінки (leads.locale)
    locale: z.string().max(10).optional(),
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
