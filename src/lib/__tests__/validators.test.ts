// Unit-тести Zod-схеми заявки VRK
// Запуск: npx vitest run src/lib/__tests__/validators.test.ts

import { describe, it, expect } from "vitest";
import { leadSchema } from "@/lib/validators";

// Валідні дані форми VRK (телефон — у форматі маски лендінгу)
const validLead = {
  name: "Іван Петренко",
  phone: "+380 (99) 123-45-67",
  turnstileToken: "cf-turnstile-token-abc123",
};

describe("leadSchema (VRK)", () => {
  // --- Позитивний шлях ---

  it("приймає мінімально валідні дані (ім'я + телефон)", () => {
    const result = leadSchema.safeParse(validLead);
    expect(result.success).toBe(true);
  });

  it("приймає повний набір полів", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      website: "example.com",
      comment: "Цікавить аудит кампаній",
      source: "hero",
      adFormat: "Пошукова реклама",
      budget: "1000–3000 $",
      service: "Аудит Google Ads",
      goal: "Ліди",
      email: "ivan@example.com",
      utm: {
        utm_source: "google",
        utm_medium: "cpc",
        gclid: "abc123",
        referrer: "https://google.com/",
      },
      page: "https://vrkpartners.com/?utm_source=google",
    });
    expect(result.success).toBe(true);
  });

  it("приймає телефон без маски (+380991234567 — 12 цифр)", () => {
    const result = leadSchema.safeParse({ ...validLead, phone: "+380991234567" });
    expect(result.success).toBe(true);
  });

  it("приймає коментар рівно 1000 символів", () => {
    const result = leadSchema.safeParse({ ...validLead, comment: "а".repeat(1000) });
    expect(result.success).toBe(true);
  });

  it("приймає порожній email і відсутній email", () => {
    expect(leadSchema.safeParse({ ...validLead, email: "" }).success).toBe(true);
    expect(leadSchema.safeParse(validLead).success).toBe(true);
  });

  // --- Негативний шлях: телефон ---

  it("відхиляє телефон з неповною кількістю цифр", () => {
    const result = leadSchema.safeParse({ ...validLead, phone: "+380 (99) 123-45" });
    expect(result.success).toBe(false);
    const errors = result.error?.flatten().fieldErrors.phone;
    expect(errors).toBeDefined();
  });

  it("відхиляє порожній телефон", () => {
    const result = leadSchema.safeParse({ ...validLead, phone: "" });
    expect(result.success).toBe(false);
  });

  // --- Негативний шлях: ім'я ---

  it("відхиляє порожнє ім'я", () => {
    const result = leadSchema.safeParse({ ...validLead, name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.name).toBeDefined();
  });

  it("відхиляє ім'я з одним символом (менше мінімуму 2)", () => {
    const result = leadSchema.safeParse({ ...validLead, name: "І" });
    expect(result.success).toBe(false);
  });

  it("відхиляє ім'я довше 60 символів", () => {
    const result = leadSchema.safeParse({ ...validLead, name: "а".repeat(61) });
    expect(result.success).toBe(false);
  });

  it("відхиляє ім'я з цифрами/символами", () => {
    const result = leadSchema.safeParse({ ...validLead, name: "Іван123" });
    expect(result.success).toBe(false);
  });

  // --- Негативний шлях: comment / email ---

  it("відхиляє коментар довше 1000 символів", () => {
    const result = leadSchema.safeParse({ ...validLead, comment: "а".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("відхиляє некоректний email", () => {
    const result = leadSchema.safeParse({ ...validLead, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  // --- Honeypot (company) ---

  it("відхиляє заповнений honeypot (company != '')", () => {
    const result = leadSchema.safeParse({ ...validLead, company: "Spam Inc" });
    expect(result.success).toBe(false);
  });

  it("приймає порожній company і відсутній company", () => {
    expect(leadSchema.safeParse({ ...validLead, company: "" }).success).toBe(true);
    expect(leadSchema.safeParse(validLead).success).toBe(true);
  });

  // --- website — РЕАЛЬНЕ поле (не honeypot) ---

  it("приймає заповнений website (реальне поле «Сайт / ніша»)", () => {
    const result = leadSchema.safeParse({ ...validLead, website: "https://shop.example.com" });
    expect(result.success).toBe(true);
  });

  // --- UTM ---

  it("відхиляє utm з задовгим gclid (>512)", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      utm: { gclid: "x".repeat(513) },
    });
    expect(result.success).toBe(false);
  });

  it("ігнорує невідомі ключі в utm", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      utm: { utm_source: "google", yclid: "заборонено" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm).toEqual({ utm_source: "google" });
    }
  });
});
