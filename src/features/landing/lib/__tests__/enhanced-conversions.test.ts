// Enhanced Conversions на сайті: gtag('set','user_data') з sha256-хешами нормалізованих значень.
// Середовище node: Web Crypto доступний через globalThis.crypto.
import { describe, it, expect, vi, afterEach } from "vitest";
import { setEnhancedConversionUserData } from "@/features/landing/lib/enhanced-conversions";
import { sha256Hex } from "@core/domain/funnel/enhanced-conversions";

const SHA_TEST_EMAIL = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";

describe("sha256Hex", () => {
  it("відомий вектор: sha256('test@example.com')", async () => {
    expect(await sha256Hex("test@example.com")).toBe(SHA_TEST_EMAIL);
  });

  it("64 hex-символи для непорожнього вводу", async () => {
    expect(await sha256Hex("+380671234567")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("не кидає без crypto.subtle → ''", async () => {
    vi.stubGlobal("crypto", {} as Crypto);
    try {
      expect(await sha256Hex("test@example.com")).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("setEnhancedConversionUserData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-op без window (SSR) і без window.gtag", async () => {
    await expect(setEnhancedConversionUserData({ email: "test@test.com" })).resolves.toBeUndefined();
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag: undefined, crypto: globalThis.crypto });
    await setEnhancedConversionUserData({ email: "test@test.com" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("email нормалізується (trim/lowercase) → sha256_email_address, сирий email не передається", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });
    await setEnhancedConversionUserData({ email: "  TEST@EXAMPLE.COM  " });
    expect(gtag).toHaveBeenCalledOnce();
    const [cmd, field, userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(cmd).toBe("set");
    expect(field).toBe("user_data");
    expect(userData.sha256_email_address).toBe(SHA_TEST_EMAIL);
    expect(JSON.stringify(userData)).not.toContain("@");
  });

  it("gmail: крапки до @ прибираються перед хешем (розділ 15)", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });
    await setEnhancedConversionUserData({ email: "Ivan.Petrenko@gmail.com" });
    const [, , userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(userData.sha256_email_address).toBe(await sha256Hex("ivanpetrenko@gmail.com"));
  });

  it("телефон з маски → E.164 через єдину normalizePhone → sha256_phone_number", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });
    await setEnhancedConversionUserData({ phone: "+380 (67) 123-45-67" });
    const [, , userData] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(userData.sha256_phone_number).toBe(await sha256Hex("+380671234567"));
    expect(userData).not.toHaveProperty("sha256_email_address");
  });

  it("обидва поля; порожні дані → no-op; помилка gtag не кидає", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, crypto: globalThis.crypto });
    await setEnhancedConversionUserData({ email: "test@example.com", phone: "+380671234567" });
    expect(gtag.mock.calls[0][2]).toHaveProperty("sha256_email_address");
    expect(gtag.mock.calls[0][2]).toHaveProperty("sha256_phone_number");
    gtag.mockClear();
    await setEnhancedConversionUserData({});
    expect(gtag).not.toHaveBeenCalled();
    const throwing = vi.fn(() => {
      throw new Error("gtag error");
    });
    vi.stubGlobal("window", { gtag: throwing, crypto: globalThis.crypto });
    await expect(setEnhancedConversionUserData({ email: "test@example.com" })).resolves.toBeUndefined();
  });
});
