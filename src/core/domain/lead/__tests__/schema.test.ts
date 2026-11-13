// Unit-тесты Zod-схемы заявки (тексты ошибок — параметром из текстов сайта).
import { describe, it, expect } from "vitest";
import { makeLeadSchema, leadDefaults } from "../schema";

const T = {
  errorNameMin: "Вкажіть ім'я",
  errorNameMax: "Занадто довге ім'я",
  errorNameLetters: "Лише літери",
  errorPhoneRequired: "Вкажіть телефон",
  errorPhoneIncomplete: "Повний номер",
  errorEmailInvalid: "Некоректний email",
};
const leadSchema = makeLeadSchema(T);

// Валидные данные формы (телефон — в формате маски лендинга)
const validLead = { name: "Іван Петренко", phone: "+380 (99) 123-45-67" };

describe("makeLeadSchema", () => {
  it("приймає мінімально валідні дані (ім'я + телефон) і дефолти форми", () => {
    expect(leadSchema.safeParse(validLead).success).toBe(true);
    expect(leadSchema.safeParse({ ...leadDefaults, ...validLead }).success).toBe(true);
  });

  it("приймає повний набір полів і нормалізує телефон у E.164", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      comment: "Цікавить аудит кампаній",
      source: "hero",
      service: "Аудит Google Ads",
      email: "ivan@example.com",
      locale: "uk",
      utm: { utm_source: "google", utm_medium: "cpc", gclid: "abc123", referrer: "https://google.com/" },
      page: "https://vrk.com.ua/?utm_source=google",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+380991234567");
  });

  it("невідомі поля (website, adFormat, budget, goal) відкидаються без помилки", () => {
    const result = leadSchema.safeParse({ ...validLead, website: "x.com", adFormat: "a", budget: "b", goal: "g" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("website");
  });

  it("телефон: без маски ок; неповний / порожній — помилка з текстом із messages", () => {
    expect(leadSchema.safeParse({ ...validLead, phone: "+380991234567" }).success).toBe(true);
    const short = leadSchema.safeParse({ ...validLead, phone: "+380 (99) 123-45" });
    expect(short.success).toBe(false);
    expect(short.error?.flatten().fieldErrors.phone).toEqual([T.errorPhoneIncomplete]);
    const empty = leadSchema.safeParse({ ...validLead, phone: "" });
    expect(empty.error?.flatten().fieldErrors.phone?.[0]).toBe(T.errorPhoneRequired);
  });

  it("ім'я: порожнє / 1 символ / >60 / цифри — помилки з текстом із messages", () => {
    expect(leadSchema.safeParse({ ...validLead, name: "" }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameMin);
    expect(leadSchema.safeParse({ ...validLead, name: "І" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, name: "а".repeat(61) }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameMax);
    expect(leadSchema.safeParse({ ...validLead, name: "Іван123" }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameLetters);
  });

  it("comment ≤ 500, service ≤ 50; email порожній/відсутній ок, некоректний — помилка", () => {
    expect(leadSchema.safeParse({ ...validLead, comment: "а".repeat(500) }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, comment: "а".repeat(501) }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, service: "x".repeat(51) }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, email: "" }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, email: "not-an-email" }).error?.flatten().fieldErrors.email?.[0]).toBe(T.errorEmailInvalid);
  });

  it("ref: нормалізується; невалідний/задовгий/не рядок → undefined, ніколи не помилка", () => {
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: " ABC123 " }).ref).toBe("abc123");
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: "x".repeat(200) }).ref).toBeUndefined();
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: 42 }).ref).toBeUndefined();
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567" }).ref).toBeUndefined();
  });

  it("honeypot `company` проходить Zod (рішення — у сценарії, фейковий успіх)", () => {
    const result = leadSchema.safeParse({ ...validLead, company: "Spam Inc" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.company).toBe("Spam Inc");
    expect(leadSchema.safeParse({ ...validLead, company: "" }).success).toBe(true);
  });

  it("utm: задовгий gclid (>512) — помилка; невідомі ключі ігноруються", () => {
    expect(leadSchema.safeParse({ ...validLead, utm: { gclid: "x".repeat(513) } }).success).toBe(false);
    const result = leadSchema.safeParse({ ...validLead, utm: { utm_source: "google", yclid: "заборонено" } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.utm).toEqual({ utm_source: "google" });
  });
});
