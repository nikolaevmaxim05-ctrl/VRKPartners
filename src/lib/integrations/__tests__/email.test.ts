// Unit-тесты для sendLeadEmail() через Resend SDK
// Мокируем весь модуль resend — не делаем реальных HTTP-запросов

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Мок Resend SDK — мокируем до импорта тестируемого модуля
// Resend — класс (конструктор), тому використовуємо function-форму
const mockSend = vi.fn();

vi.mock("resend", () => {
  // Повертаємо клас (function-based constructor) — vi.fn().mockImplementation
  // не підходить для `new`, тому використовуємо звичайну функцію-конструктор
  function ResendMock() {
    return {
      emails: {
        send: mockSend,
      },
    };
  }

  return {
    Resend: ResendMock,
  };
});

// Импортируем ПОСЛЕ мока
import { sendLeadEmail } from "@/lib/integrations/email";

const VALID_LEAD = {
  name: "Петро Сидоренко",
  phone: "+380441234567",
  service: "Аудит Google Ads",
  comment: "Болить зуб мудрості",
};

const VALID_LEAD_NO_COMMENT = {
  name: "Наталія Мельник",
  phone: "+380501234567",
  service: "children",
};

describe("sendLeadEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockSend.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("повертає ok:false і console.warn якщо немає RESEND_API_KEY", async () => {
    delete process.env.RESEND_API_KEY;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not configured");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[email]");
    expect(mockSend).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("успішно відправляє email якщо Resend повертає { error: null }", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({ error: null, data: { id: "email-id-123" } });

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("передає правильні поля в resend.emails.send", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({ error: null });

    await sendLeadEmail(VALID_LEAD);

    const callArgs = mockSend.mock.calls[0][0];

    expect(callArgs.from).toBe("noreply@usmishka.com.ua");
    expect(callArgs.to).toBe("admin@usmishka.com.ua");
    // Тема листа містить ім'я пацієнта
    expect(callArgs.subject).toContain("Петро Сидоренко");
    // HTML — не порожній рядок
    expect(typeof callArgs.html).toBe("string");
    expect(callArgs.html.length).toBeGreaterThan(100);
  });

  it("HTML листа містить ім'я, телефон та послугу", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({ error: null });

    await sendLeadEmail(VALID_LEAD);

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Петро Сидоренко");
    expect(html).toContain("+380441234567");
    expect(html).toContain("Аудит Google Ads");
    expect(html).toContain("Болить зуб мудрості");
  });

  it("HTML листа не містить коментар якщо він не передано", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({ error: null });

    await sendLeadEmail(VALID_LEAD_NO_COMMENT);

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Наталія Мельник");
    // Рядок коментаря НЕ має бути в HTML
    expect(html).not.toMatch(/Коментар.*<\/td>/);
  });

  it("повертає ok:false якщо Resend повертає об'єкт error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({
      error: { message: "Invalid API Key", name: "validation_error" },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid API Key");

    errorSpy.mockRestore();
  });

  it("повертає ok:false якщо resend.emails.send кидає виняток", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockRejectedValue(new Error("Resend internal error"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("send error");

    errorSpy.mockRestore();
  });

  it("використовує NOTIFICATION_EMAIL або siteConfig.contacts.email як отримувача", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    // Явно вказуємо admin email
    process.env.NOTIFICATION_EMAIL = "custom-admin@hospital.ua";

    mockSend.mockResolvedValue({ error: null });

    await sendLeadEmail(VALID_LEAD_NO_COMMENT);

    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.to).toBe("custom-admin@hospital.ua");
  });

  it("HTML містить lang='uk' (лист на українській мові)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@usmishka.com.ua";
    process.env.NOTIFICATION_EMAIL = "admin@usmishka.com.ua";

    mockSend.mockResolvedValue({ error: null });

    await sendLeadEmail(VALID_LEAD);

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('lang="uk"');
  });
});
