// Тесты enhanced-conversions.ts (промпт 021).
// Среда node: Web Crypto доступен через globalThis.crypto.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeEmail,
  normalizePhoneE164,
  sha256Hex,
  setEnhancedConversionUserData,
} from "@/lib/enhanced-conversions";

describe("normalizeEmail", () => {
  it("trim + lowercase", () => {
    expect(normalizeEmail("  Test@Example.COM ")).toBe("test@example.com");
    expect(normalizeEmail("USER@DOMAIN.ORG")).toBe("user@domain.org");
    expect(normalizeEmail("already@lower.com")).toBe("already@lower.com");
    expect(normalizeEmail("  spaced@email.ua  ")).toBe("spaced@email.ua");
  });
});

describe("normalizePhoneE164", () => {
  it("удаляет пробелы, скобки, дефисы, точки — оставляет + и цифры", () => {
    expect(normalizePhoneE164("+380 (44) 123-45-67")).toBe("+380441234567");
    expect(normalizePhoneE164("+38 044 123 45 67")).toBe("+380441234567");
    expect(normalizePhoneE164("+380.44.123.45.67")).toBe("+380441234567");
    expect(normalizePhoneE164("+380441234567")).toBe("+380441234567");
  });

  it("строгий Zod-формат +380XXXXXXXXX остается без изменений", () => {
    expect(normalizePhoneE164("+380671234567")).toBe("+380671234567");
    expect(normalizePhoneE164("+380501234567")).toBe("+380501234567");
  });
});

describe("sha256Hex", () => {
  it("известный вектор: sha256('test@example.com') = 973dfe...", async () => {
    const result = await sha256Hex("test@example.com");
    expect(result).toBe("973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b");
  });

  it("пустая строка — не кидает исключений, возвращает hex или пустую строку", async () => {
    const result = await sha256Hex("");
    // В node-среде crypto.subtle доступен → возвращает корректный хеш пустой строки
    if (result !== "") {
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("возвращает строку из 64 hex-символов для непустого ввода", async () => {
    const result = await sha256Hex("+380671234567");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("не кидает исключений при отсутствии crypto.subtle (мок)", async () => {
    // globalThis.crypto в node — getter-only, мокируем через vi.stubGlobal
    vi.stubGlobal("crypto", {} as Crypto);
    try {
      const result = await sha256Hex("test@example.com");
      expect(result).toBe(""); // возвращает пустую строку при недоступности subtle
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("setEnhancedConversionUserData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-op при отсутствии window (SSR)", async () => {
    // В node-среде window не определен — функция должна завершиться без ошибок
    await expect(setEnhancedConversionUserData({ email: "test@test.com" })).resolves.toBeUndefined();
  });

  it("no-op при отсутствии window.gtag", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag: undefined, crypto: globalThis.crypto });
    await expect(setEnhancedConversionUserData({ email: "test@test.com" })).resolves.toBeUndefined();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("вызывает gtag('set', 'user_data') с sha256_email_address", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await setEnhancedConversionUserData({ email: "test@example.com" });

    expect(gtag).toHaveBeenCalledOnce();
    const [cmd, field, userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(cmd).toBe("set");
    expect(field).toBe("user_data");
    expect(userData).toHaveProperty("sha256_email_address");
    // Проверяем что это хеш (64 hex-символа) и НЕ сырой email
    expect(userData.sha256_email_address).toMatch(/^[0-9a-f]{64}$/);
    expect(userData.sha256_email_address).not.toContain("@");
    // Проверяем точный хеш normalize("test@example.com") = sha256("test@example.com")
    expect(userData.sha256_email_address).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"
    );
  });

  it("вызывает gtag с sha256_phone_number", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await setEnhancedConversionUserData({ phone: "+380 (67) 123-45-67" });

    expect(gtag).toHaveBeenCalledOnce();
    const [, , userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(userData).toHaveProperty("sha256_phone_number");
    expect(userData.sha256_phone_number).toMatch(/^[0-9a-f]{64}$/);
    // Не должен содержать сырой номер или пробелы
    expect(userData.sha256_phone_number).not.toContain("+");
    expect(userData).not.toHaveProperty("sha256_email_address");
  });

  it("передает оба поля если email и phone заданы", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await setEnhancedConversionUserData({
      email: "test@example.com",
      phone: "+380671234567",
    });

    const [, , userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(userData).toHaveProperty("sha256_email_address");
    expect(userData).toHaveProperty("sha256_phone_number");
  });

  it("нормализует email перед хешированием (uppercase → lowercase)", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await setEnhancedConversionUserData({ email: "  TEST@EXAMPLE.COM  " });

    const [, , userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    // Хеш должен совпадать с хешем normalize "test@example.com"
    expect(userData.sha256_email_address).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"
    );
  });

  it("no-op если нет данных для передачи (оба поля пустые)", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await setEnhancedConversionUserData({});

    expect(gtag).not.toHaveBeenCalled();
  });

  it("никогда не кидает исключений даже при ошибке", async () => {
    const gtag = vi.fn().mockImplementation(() => {
      throw new Error("gtag error");
    });
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });

    await expect(
      setEnhancedConversionUserData({ email: "test@example.com" })
    ).resolves.toBeUndefined();
  });
});
