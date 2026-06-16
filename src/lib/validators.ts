import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(2, "Вкажіть ім'я (мінімум 2 символи)")
  .max(60, "Занадто довге ім'я")
  .regex(
    /^[A-Za-zА-Яа-яЁёЇїІіЄєҐґ'’\s-]+$/u,
    "Ім'я може містити лише літери"
  );

/** Телефон у форматі +380 (XX) XXX-XX-XX — рівно 12 цифр (380 + 9). */
const phone = z
  .string()
  .trim()
  .min(1, "Вкажіть номер телефону")
  .refine(
    (v) => v.replace(/\D/g, "").length === 12,
    "Введіть повний номер телефону"
  );

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(""));

const comment = z.string().trim().max(1000).optional().or(z.literal(""));

/** Honeypot: приховане поле, яке заповнюють лише боти — має лишатися порожнім. */
const honeypot = z.literal("").optional();

/** Базова заявка (перший екран, фінальна форма). */
export const leadSchema = z.object({
  name,
  phone,
  website: optionalUrl,
  comment,
  // тип форми / контекст блоку для аналітики
  source: z.string().max(60).optional(),
  // додаткові поля окремих поп-апів
  adFormat: z.string().max(60).optional(),
  budget: z.string().max(60).optional(),
  service: z.string().max(60).optional(),
  goal: z.string().max(60).optional(),
  company: honeypot, // honeypot
  // Токен Cloudflare Turnstile (перевіряється на сервері, якщо налаштовано)
  turnstileToken: z.string().max(4096).optional().or(z.literal("")),
});

export type LeadInput = z.infer<typeof leadSchema>;

export const leadDefaults: LeadInput = {
  name: "",
  phone: "",
  website: "",
  comment: "",
  source: "",
  adFormat: "",
  budget: "",
  service: "",
  goal: "",
  company: "",
  turnstileToken: "",
};
