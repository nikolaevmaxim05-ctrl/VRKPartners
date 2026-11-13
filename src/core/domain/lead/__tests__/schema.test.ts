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
  it("принимает минимально валидные данные (имя + телефон) и дефолты формы", () => {
    expect(leadSchema.safeParse(validLead).success).toBe(true);
    expect(leadSchema.safeParse({ ...leadDefaults, ...validLead }).success).toBe(true);
  });

  it("принимает полный набор полей и нормализует телефон в E.164", () => {
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

  it("неизвестные поля (website, adFormat, budget, goal) отбрасываются без ошибки", () => {
    const result = leadSchema.safeParse({ ...validLead, website: "x.com", adFormat: "a", budget: "b", goal: "g" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("website");
  });

  it("телефон: без маски ок; неполный / пустой — ошибка с текстом из messages", () => {
    expect(leadSchema.safeParse({ ...validLead, phone: "+380991234567" }).success).toBe(true);
    const short = leadSchema.safeParse({ ...validLead, phone: "+380 (99) 123-45" });
    expect(short.success).toBe(false);
    expect(short.error?.flatten().fieldErrors.phone).toEqual([T.errorPhoneIncomplete]);
    const empty = leadSchema.safeParse({ ...validLead, phone: "" });
    expect(empty.error?.flatten().fieldErrors.phone?.[0]).toBe(T.errorPhoneRequired);
  });

  it("имя: пустое / 1 символ / >60 / цифры — ошибки с текстом из messages", () => {
    expect(leadSchema.safeParse({ ...validLead, name: "" }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameMin);
    expect(leadSchema.safeParse({ ...validLead, name: "І" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, name: "а".repeat(61) }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameMax);
    expect(leadSchema.safeParse({ ...validLead, name: "Іван123" }).error?.flatten().fieldErrors.name?.[0]).toBe(T.errorNameLetters);
  });

  it("comment ≤ 500, service ≤ 50; email пустой/отсутствует ок, некорректный — ошибка", () => {
    expect(leadSchema.safeParse({ ...validLead, comment: "а".repeat(500) }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, comment: "а".repeat(501) }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, service: "x".repeat(51) }).success).toBe(false);
    expect(leadSchema.safeParse({ ...validLead, email: "" }).success).toBe(true);
    expect(leadSchema.safeParse({ ...validLead, email: "not-an-email" }).error?.flatten().fieldErrors.email?.[0]).toBe(T.errorEmailInvalid);
  });

  it("ref: нормализуется; невалидный/слишком длинный/не строка → undefined, никогда не ошибка", () => {
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: " ABC123 " }).ref).toBe("abc123");
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: "x".repeat(200) }).ref).toBeUndefined();
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567", ref: 42 }).ref).toBeUndefined();
    expect(leadSchema.parse({ name: "Тест Тест", phone: "+380501234567" }).ref).toBeUndefined();
  });

  it("honeypot `company` проходит Zod (решение — в сценарии, фейковый успех)", () => {
    const result = leadSchema.safeParse({ ...validLead, company: "Spam Inc" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.company).toBe("Spam Inc");
    expect(leadSchema.safeParse({ ...validLead, company: "" }).success).toBe(true);
  });

  it("utm: слишком длинный gclid (>512) — ошибка; неизвестные ключи игнорируются", () => {
    expect(leadSchema.safeParse({ ...validLead, utm: { gclid: "x".repeat(513) } }).success).toBe(false);
    const result = leadSchema.safeParse({ ...validLead, utm: { utm_source: "google", yclid: "заборонено" } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.utm).toEqual({ utm_source: "google" });
  });
});
