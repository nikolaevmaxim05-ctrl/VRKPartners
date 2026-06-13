import { z } from "zod";

/** Український номер або міжнародний формат: 7–15 цифр, можливі +, пробіли, дужки, дефіси. */
const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;

const name = z
  .string()
  .trim()
  .min(2, "Вкажіть ім'я (мінімум 2 символи)")
  .max(60, "Занадто довге ім'я");

const phone = z
  .string()
  .trim()
  .min(7, "Вкажіть номер телефону")
  .regex(phoneRegex, "Перевірте формат номера телефону");

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
};
