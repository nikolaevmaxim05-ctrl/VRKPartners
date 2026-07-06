// Unit-тесты для sendLeadToTelegram()
// Мокируем глобальный fetch — реальных сетевых запросов нет

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendLeadToTelegram } from "@/lib/integrations/telegram";

const VALID_LEAD = {
  name: "Тест Тестенко",
  phone: "+380991234567",
  service: "Аудит Google Ads",
  comment: "Хочу дізнатись деталі",
};

const VALID_LEAD_NO_COMMENT = {
  name: "Тест Тестенко",
  phone: "+380991234567",
  service: "therapy",
};

describe("sendLeadToTelegram", () => {
  // Сохраняем и восстанавливаем env-переменные
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Сбрасываем env перед каждым тестом
    process.env = { ...originalEnv };
    // Мокируем глобальный fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("повертає ok:false і console.warn, якщо немає TELEGRAM_BOT_TOKEN", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendLeadToTelegram(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not configured");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[telegram]");
    // fetch НЕ повинен викликатись
    expect(fetch).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("повертає ok:false і console.warn, якщо є TOKEN але немає CHAT_ID", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token-abc";
    delete process.env.TELEGRAM_CHAT_ID;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendLeadToTelegram(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("викликає fetch на правильний URL з правильним payload при валідному виклику", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "12345:ABC-TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-1001234567890";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendLeadToTelegram(VALID_LEAD);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

    // Правильний URL Telegram Bot API
    expect(url).toBe(
      "https://api.telegram.org/bot12345:ABC-TOKEN/sendMessage"
    );

    // Метод POST
    expect(options.method).toBe("POST");

    // Перевіряємо payload
    const body = JSON.parse(options.body as string);
    expect(body.chat_id).toBe("-1001234567890");
    expect(body.parse_mode).toBe("HTML");
    // Текст повинен містити ім'я, телефон та послугу
    expect(body.text).toContain("Тест Тестенко");
    expect(body.text).toContain("+380991234567");
    expect(body.text).toContain("Аудит Google Ads");
    // Коментар теж присутній
    expect(body.text).toContain("Хочу дізнатись деталі");
  });

  it("payload містить ім'я і телефон навіть без коментаря", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat-id";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendLeadToTelegram(VALID_LEAD_NO_COMMENT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text).toContain("Тест Тестенко");
    expect(body.text).toContain("+380991234567");
    // Рядок "Коментар:" НЕ повинен бути в тексті
    expect(body.text).not.toContain("Коментар:");
  });

  it("повертає ok:false якщо fetch кидає помилку мережі", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat-id";

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendLeadToTelegram(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("fetch error");
    expect(errorSpy).toHaveBeenCalledOnce();

    errorSpy.mockRestore();
  });

  it("повертає ok:false якщо Telegram API відповідає не-OK статусом", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat-id";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"Bad Request"}',
    });
    vi.stubGlobal("fetch", mockFetch);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendLeadToTelegram(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("HTTP 400");

    errorSpy.mockRestore();
  });

  it("екранує HTML-спецсимволи в імені та телефоні", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat-id";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendLeadToTelegram({
      name: 'Ivan <Test> & "Quote"',
      phone: "+380991234567",
      service: "therapy",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // Символи мають бути заекрановані
    expect(body.text).not.toContain("<Test>");
    expect(body.text).toContain("&lt;Test&gt;");
    expect(body.text).toContain("&amp;");
  });
});
