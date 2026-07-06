// Unit-тесты для createKeyCRMLead()
// Мокируем глобальный fetch — реальных сетевых запросов нет

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createKeyCRMLead } from "@/lib/integrations/keycrm";

const VALID_LEAD = {
  name: "Олена Іванова",
  phone: "+380671234567",
  service: "Контекстна реклама",
  comment: "Цікавлять елайнери",
};

const VALID_LEAD_NO_COMMENT = {
  name: "Олена Іванова",
  phone: "+380671234567",
  service: "children",
};

describe("createKeyCRMLead", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("повертає ok:false і console.warn, якщо немає KEYCRM_API_KEY", async () => {
    delete process.env.KEYCRM_API_KEY;
    delete process.env.KEYCRM_PIPELINE_ID;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createKeyCRMLead(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not configured");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[keycrm]");
    expect(fetch).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("повертає ok:false якщо є API_KEY але немає PIPELINE_ID", async () => {
    process.env.KEYCRM_API_KEY = "key-abc";
    delete process.env.KEYCRM_PIPELINE_ID;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createKeyCRMLead(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("викликає fetch на правильний URL з Bearer-токеном", async () => {
    process.env.KEYCRM_API_KEY = "my-secret-key";
    process.env.KEYCRM_PIPELINE_ID = "42";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"id":100}',
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createKeyCRMLead(VALID_LEAD);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://openapi.keycrm.app/v1/leads");
    expect(options.method).toBe("POST");

    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-secret-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("payload містить правильні поля ліда", async () => {
    process.env.KEYCRM_API_KEY = "key";
    process.env.KEYCRM_PIPELINE_ID = "7";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    await createKeyCRMLead(VALID_LEAD);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);

    expect(body.pipeline_id).toBe(7); // число, не рядок
    expect(body.contact.full_name).toBe("Олена Іванова");
    expect(body.contact.phone).toBe("+380671234567");
    expect(body.tags).toContain("landing");
    expect(body.tags).toContain("service:Контекстна реклама");
    expect(body.note).toBe("Цікавлять елайнери");
    // Послуга — локалізована назва в title
    expect(body.title).toContain("Контекстна реклама");
  });

  it("не включає поле note якщо comment відсутній", async () => {
    process.env.KEYCRM_API_KEY = "key";
    process.env.KEYCRM_PIPELINE_ID = "7";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    await createKeyCRMLead(VALID_LEAD_NO_COMMENT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.note).toBeUndefined();
  });

  it("повертає ok:false якщо fetch кидає виняток", async () => {
    process.env.KEYCRM_API_KEY = "key";
    process.env.KEYCRM_PIPELINE_ID = "7";

    const mockFetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createKeyCRMLead(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("fetch error");

    errorSpy.mockRestore();
  });

  it("повертає ok:false та error з HTTP-статусом при non-OK відповіді", async () => {
    process.env.KEYCRM_API_KEY = "key";
    process.env.KEYCRM_PIPELINE_ID = "7";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"Validation Error"}',
    });
    vi.stubGlobal("fetch", mockFetch);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createKeyCRMLead(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("HTTP 422");

    errorSpy.mockRestore();
  });

  it("джерело ліда завжди 'Лендинг'", async () => {
    process.env.KEYCRM_API_KEY = "key";
    process.env.KEYCRM_PIPELINE_ID = "1";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    await createKeyCRMLead(VALID_LEAD_NO_COMMENT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.source).toBe("Лендинг");
  });
});
