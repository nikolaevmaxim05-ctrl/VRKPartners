// Тесты реестра событий аналитики (лендинг VRK).
// Среда node: window для track() стабится через vi.stubGlobal.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENT_KEYS,
  ANALYTICS_EVENT_NAME_PATTERN,
  MAX_EVENT_NAMES_PER_KEY,
  getDefaultAnalyticsEvents,
  parseAnalyticsEventsConfig,
  resolveAnalyticsEvent,
  isValidEventName,
  type AnalyticsEventsConfig,
} from "@core/domain/analytics/registry";
import { track } from "@/shared/lib/analytics";

describe("ANALYTICS_REGISTRY", () => {
  it("ключи уникальны и валидны по паттерну имени события", () => {
    const keys = ANALYTICS_REGISTRY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(ANALYTICS_EVENT_NAME_PATTERN);
    }
  });

  it("каждая запись имеет непустой defaultEventNames с валидными именами", () => {
    for (const entry of ANALYTICS_REGISTRY) {
      expect(entry.defaultEventNames.length, `${entry.key}: defaultEventNames не должен быть пустым`).toBeGreaterThan(0);
      for (const name of entry.defaultEventNames) {
        expect(name, `${entry.key}: невалидное имя в defaultEventNames`).toMatch(ANALYTICS_EVENT_NAME_PATTERN);
      }
    }
  });

  it("реестр содержит ключи форм VRK", () => {
    const formKeys = [
      "form_open",
      "form_submit_attempt",
      "form_submit_success",
      "form_submit_error",
    ];
    for (const key of formKeys) {
      expect(ANALYTICS_EVENT_KEYS.has(key), `реестр должен содержать ${key}`).toBe(true);
    }
  });

  it("CTA-ключи блоков имеют default ['cta_click'] (GTM-триггеры не ломаются)", () => {
    const ctaKeys = [
      "header_cta_click",
      "hero_consult_cta_click",
      "hero_audit_cta_click",
      "services_cta_click",
      "audit_request_click",
      "audit_calc_click",
      "trust_cta_click",
      "google_bonus_cta_click",
      "final_cta_click",
    ];
    for (const key of ctaKeys) {
      const entry = ANALYTICS_REGISTRY.find((e) => e.key === key);
      expect(entry, `отсутствует запись для ${key}`).toBeDefined();
      expect(entry!.defaultEventNames).toEqual(["cta_click"]);
    }
  });

  it("телефон в шапке имеет default ['phone_click']", () => {
    const entry = ANALYTICS_REGISTRY.find((e) => e.key === "header_phone_click");
    expect(entry).toBeDefined();
    expect(entry!.defaultEventNames).toEqual(["phone_click"]);
  });

  it("telegram-контакт имеет default ['telegram_click']", () => {
    const entry = ANALYTICS_REGISTRY.find((e) => e.key === "contacts_telegram_click");
    expect(entry).toBeDefined();
    expect(entry!.defaultEventNames).toEqual(["telegram_click"]);
  });

  it("form-ключи НЕ используют form_start/form_submit (конфликт с GA4 Enhanced Measurement)", () => {
    const reserved = new Set(["form_start", "form_submit"]);
    for (const entry of ANALYTICS_REGISTRY) {
      for (const name of entry.defaultEventNames) {
        expect(reserved.has(name), `${entry.key}: имя ${name} конфликтует с GA4`).toBe(false);
      }
    }
  });

  it("успешная отправка формы дефолтит generate_lead (GA4 recommended)", () => {
    expect(ANALYTICS_REGISTRY.find((e) => e.key === "form_submit_success")!.defaultEventNames).toEqual(["generate_lead"]);
  });

  it("реестр содержит ключи кейсов и партнёров VRK", () => {
    const vrkKeys = ["case_niche_click", "case_open", "case_site_click", "partner_click"];
    for (const key of vrkKeys) {
      expect(ANALYTICS_EVENT_KEYS.has(key), `реестр должен содержать ${key}`).toBe(true);
    }
  });
});

describe("MAX_EVENT_NAMES_PER_KEY", () => {
  it("константа равна 5", () => {
    expect(MAX_EVENT_NAMES_PER_KEY).toBe(5);
  });
});

// Хелпер: конструирует минимально валидную AnalyticsEventsConfig-запись
function cfg(opts: { enabled: boolean; eventNames?: string[]; eventName?: string }) {
  const names = opts.eventNames ?? (opts.eventName ? [opts.eventName] : []);
  return {
    enabled: opts.enabled,
    eventNames: opts.eventNames,
    eventName: opts.eventName ?? names[0] ?? "unknown",
  };
}

describe("resolveAnalyticsEvent", () => {
  it("без конфига → enabled=true, eventNames = defaultEventNames реестра", () => {
    const result = resolveAnalyticsEvent("form_submit_success");
    expect(result).toEqual({ enabled: true, eventNames: ["generate_lead"] });
  });

  it("без конфига, null конфиг → дефолт", () => {
    expect(resolveAnalyticsEvent("form_submit_success", null)).toEqual({
      enabled: true,
      eventNames: ["generate_lead"],
    });
  });

  it("ключ отсутствует в конфиге → дефолт из реестра", () => {
    const config: AnalyticsEventsConfig = {
      header_cta_click: cfg({ enabled: false, eventNames: ["cta_click"] }),
    };
    const result = resolveAnalyticsEvent("case_open", config);
    expect(result).toEqual({ enabled: true, eventNames: ["case_open"] });
  });

  it("ключ вне реестра и вне конфига → { enabled: true, eventNames: [key] }", () => {
    const result = resolveAnalyticsEvent("unknown_new_key");
    expect(result).toEqual({ enabled: true, eventNames: ["unknown_new_key"] });
  });

  it("enabled=false → событие выключено", () => {
    const config: AnalyticsEventsConfig = {
      header_cta_click: cfg({ enabled: false, eventNames: ["cta_click"] }),
    };
    const { enabled } = resolveAnalyticsEvent("header_cta_click", config);
    expect(enabled).toBe(false);
  });

  it("мультиимена: резолвится весь массив", () => {
    const config: AnalyticsEventsConfig = {
      form_submit_success: cfg({
        enabled: true,
        eventNames: ["form_submitted", "generate_lead"],
      }),
    };
    const result = resolveAnalyticsEvent("form_submit_success", config);
    expect(result).toEqual({
      enabled: true,
      eventNames: ["form_submitted", "generate_lead"],
    });
  });

  it("пустой eventNames — валидное состояние (точка молчит)", () => {
    const config: AnalyticsEventsConfig = {
      case_open: cfg({ enabled: true, eventNames: [] }),
    };
    const result = resolveAnalyticsEvent("case_open", config);
    expect(result).toEqual({ enabled: true, eventNames: [] });
  });

  it("невалидное имя в конфиге отбрасывается (defense-in-depth)", () => {
    const config: AnalyticsEventsConfig = {
      case_open: cfg({ enabled: true, eventNames: ["<script>alert(1)</script>", "case_open"] }),
    };
    const result = resolveAnalyticsEvent("case_open", config);
    expect(result.eventNames).toEqual(["case_open"]);
  });

  it("обратная совместимость: track('header_cta_click') без конфига → defaultEventName 'cta_click'", () => {
    const result = resolveAnalyticsEvent("header_cta_click");
    expect(result.eventNames).toEqual(["cta_click"]);
  });

  it("легаси-запись только с eventName (без eventNames) → резолвится до [eventName]", () => {
    const config: AnalyticsEventsConfig = {
      case_open: { enabled: true, eventName: "my_case_event" },
    };
    const result = resolveAnalyticsEvent("case_open", config);
    expect(result.eventNames).toEqual(["my_case_event"]);
  });
});

describe("parseAnalyticsEventsConfig", () => {
  it("не-объект → пустой конфиг", () => {
    expect(parseAnalyticsEventsConfig(null)).toEqual({});
    expect(parseAnalyticsEventsConfig("str")).toEqual({});
    expect(parseAnalyticsEventsConfig([1, 2])).toEqual({});
    expect(parseAnalyticsEventsConfig(undefined)).toEqual({});
  });

  it("неизвестные ключи отбрасываются (whitelist реестра)", () => {
    const parsed = parseAnalyticsEventsConfig({
      evil_key: { enabled: true, eventNames: ["x"] },
      header_cta_click: { enabled: false, eventNames: ["hero_cta"] },
    });
    expect(Object.keys(parsed)).toEqual(["header_cta_click"]);
    expect(parsed.header_cta_click.eventNames).toEqual(["hero_cta"]);
    expect(parsed.header_cta_click.eventName).toBe("hero_cta");
    expect(parsed.header_cta_click.enabled).toBe(false);
  });

  it("невалидные имена в eventNames отбрасываются", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: true, eventNames: ["Has Spaces!", "valid_name", "<evil>"] },
    });
    expect(parsed.case_open.eventNames).toEqual(["valid_name"]);
  });

  it("более 5 имен обрезается до 5", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: {
        enabled: true,
        eventNames: ["a", "b", "c", "d", "e", "f", "g"],
      },
    });
    expect(parsed.case_open.eventNames).toHaveLength(5);
    expect(parsed.case_open.eventNames).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("дубликаты внутри точки схлопываются", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: true, eventNames: ["case_open", "case_open", "other"] },
    });
    expect(parsed.case_open.eventNames).toEqual(["case_open", "other"]);
  });

  it("пустой eventNames допустим (точка молчит)", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: true, eventNames: [] },
    });
    expect(parsed.case_open.eventNames).toEqual([]);
  });

  it("легаси-формат { eventName: 'x' } → { eventNames: ['x'], eventName: 'x' }", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: true, eventName: "case_open" },
    });
    expect(parsed.case_open.eventNames).toEqual(["case_open"]);
    expect(parsed.case_open.eventName).toBe("case_open");
  });

  it("легаси-формат: невалидное eventName → пустой массив, eventName = ключ", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: true, eventName: "Has Spaces!" },
    });
    expect(parsed.case_open.eventNames).toEqual([]);
    expect(parsed.case_open.eventName).toBe("case_open");
  });

  it("enabled: всё, кроме явного false — true", () => {
    const parsed = parseAnalyticsEventsConfig({
      case_open: { enabled: "nope", eventNames: ["case_open"] },
      header_cta_click: { enabled: false, eventNames: ["cta_click"] },
    });
    expect(parsed.case_open.enabled).toBe(true);
    expect(parsed.header_cta_click.enabled).toBe(false);
  });
});

describe("isValidEventName / паттерн", () => {
  it("принимает [a-z0-9_]{1,40}", () => {
    expect(isValidEventName("generate_lead")).toBe(true);
    expect(isValidEventName("a")).toBe(true);
    expect(isValidEventName("x".repeat(40))).toBe(true);
    expect(isValidEventName("form_submitted")).toBe(true);
    expect(isValidEventName("404_page_not_found")).toBe(true);
  });

  it("отклоняет пустое, длинное, верхний регистр и спецсимволы", () => {
    expect(isValidEventName("")).toBe(false);
    expect(isValidEventName("x".repeat(41))).toBe(false);
    expect(isValidEventName("CamelCase")).toBe(false);
    expect(isValidEventName("with-dash")).toBe(false);
    expect(isValidEventName("with space")).toBe(false);
    expect(isValidEventName(42)).toBe(false);
  });
});

describe("getDefaultAnalyticsEvents", () => {
  it("все ключи реестра: enabled=true, eventNames = defaultEventNames, eventName = первое имя", () => {
    const defaults = getDefaultAnalyticsEvents();
    expect(Object.keys(defaults)).toHaveLength(ANALYTICS_REGISTRY.length);
    for (const entry of ANALYTICS_REGISTRY) {
      const d = defaults[entry.key];
      expect(d.enabled).toBe(true);
      expect(d.eventNames).toEqual([...entry.defaultEventNames]);
      expect(d.eventName).toBe(entry.defaultEventNames[0]);
    }
  });
});

// ── track(): интеграция резолвера с dataLayer / gtag / plausible ────────────

type StubWindow = {
  dataLayer: Record<string, unknown>[];
  plausible: ReturnType<typeof vi.fn>;
  gtag: ReturnType<typeof vi.fn>;
  __analyticsEvents?: AnalyticsEventsConfig;
};

describe("track()", () => {
  let win: StubWindow;

  beforeEach(() => {
    win = {
      dataLayer: [],
      plausible: vi.fn(),
      gtag: vi.fn(),
    };
    vi.stubGlobal("window", win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("без конфига: header_cta_click → dataLayer получает 'cta_click' (обратная совместимость)", () => {
    track("header_cta_click");
    expect(win.dataLayer).toEqual([{ event: "cta_click" }]);
    expect(win.plausible).toHaveBeenCalledWith("cta_click", undefined);
    expect(win.gtag).toHaveBeenCalledWith("event", "cta_click", {});
  });

  it("без конфига: form_submit_success → dataLayer получает 'generate_lead'", () => {
    track("form_submit_success", { source: "final" });
    expect(win.dataLayer).toEqual([{ event: "generate_lead", source: "final" }]);
  });

  it("точка с 2 именами → 2 push в dataLayer + 2 gtag + 2 plausible", () => {
    win.__analyticsEvents = {
      form_submit_success: cfg({
        enabled: true,
        eventNames: ["form_submitted", "generate_lead"],
      }),
    };
    track("form_submit_success");

    expect(win.dataLayer).toHaveLength(2);
    expect(win.dataLayer[0]).toEqual({ event: "form_submitted" });
    expect(win.dataLayer[1]).toEqual({ event: "generate_lead" });
    expect(win.gtag).toHaveBeenCalledTimes(2);
    expect(win.plausible).toHaveBeenCalledTimes(2);
  });

  it("пустой eventNames → no-op", () => {
    win.__analyticsEvents = {
      case_open: cfg({ enabled: true, eventNames: [] }),
    };
    track("case_open");
    expect(win.dataLayer).toEqual([]);
    expect(win.plausible).not.toHaveBeenCalled();
    expect(win.gtag).not.toHaveBeenCalled();
  });

  it("enabled=false → no-op во всех каналах", () => {
    win.__analyticsEvents = {
      header_cta_click: cfg({ enabled: false, eventNames: ["cta_click"] }),
    };
    track("header_cta_click", { location: "hero" });
    expect(win.dataLayer).toEqual([]);
    expect(win.plausible).not.toHaveBeenCalled();
    expect(win.gtag).not.toHaveBeenCalled();
  });

  it("generate_lead без __leadValue → отправляется без value/currency", () => {
    win.__analyticsEvents = {
      form_submit_success: cfg({
        enabled: true,
        eventNames: ["generate_lead"],
      }),
    };
    track("form_submit_success");
    expect(win.dataLayer[0]).toEqual({ event: "generate_lead" });
  });

  it("ключ вне конфига → дефолтное имя из реестра, событие отправляется", () => {
    win.__analyticsEvents = {
      header_cta_click: cfg({ enabled: false, eventNames: ["cta_click"] }),
    };
    track("case_open", { niche: "ecommerce" });
    expect(win.dataLayer).toEqual([{ event: "case_open", niche: "ecommerce" }]);
  });

  it("gtag отсутствует (только GTM) → dataLayer и plausible работают", () => {
    // @ts-expect-error — имитируем страницу без прямых gtag-тегов
    delete win.gtag;
    track("contacts_telegram_click");
    // contacts_telegram_click по дефолту → 'telegram_click'
    expect(win.dataLayer).toEqual([{ event: "telegram_click" }]);
    expect(win.plausible).toHaveBeenCalledOnce();
  });

  it("переименование: все каналы получают кастомное имя", () => {
    win.__analyticsEvents = {
      form_open: cfg({ enabled: true, eventNames: ["lead_form_opened"] }),
    };
    track("form_open", { source: "modal" });
    expect(win.dataLayer).toEqual([{ event: "lead_form_opened", source: "modal" }]);
    expect(win.gtag).toHaveBeenCalledWith("event", "lead_form_opened", { source: "modal" });
    expect(win.plausible).toHaveBeenCalledWith("lead_form_opened", { props: { source: "modal" } });
  });

  it("легаси-запись без eventNames, но с eventName → событие отправляется", () => {
    win.__analyticsEvents = {
      case_open: { enabled: true, eventName: "my_case_event" },
    };
    track("case_open");
    expect(win.dataLayer).toEqual([{ event: "my_case_event" }]);
  });
});
