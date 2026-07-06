// Контрактный тест аналитики (data-driven от реестра).
//
// Сканирует исходники src/ и проверяет инварианты, которые иначе ловятся только
// руками + Tag Assistant:
//   1. каждый track("литерал") использует ключ из реестра (нет опечаток);
//   2. каждый data-analytics-event="..." использует ключ из реестра;
//   3. каждый ключ реестра реально упоминается в коде (нет «зарегистрировал, но не
//      подключил» — кроме явного allowlist резервных точек);
//   4. снапшот критичных дефолтных имён (случайный ренейм ломает GTM-триггеры → падает).
//
// Среда node (fs). Не рендерит компоненты — поэтому работает без jsdom.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENT_KEYS,
} from "@/lib/analytics-registry";

// ── Сбор исходников ──────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Исходники, КРОМЕ тестов и самого реестра (в реестре ключи объявлены — не «использование»)
const SOURCE_FILES = walk(SRC_ROOT).filter(
  (f) => !f.includes("__tests__") && !f.endsWith(path.join("lib", "analytics-registry.ts")),
);
const ALL_SOURCE = SOURCE_FILES.map((f) => fs.readFileSync(f, "utf8")).join("\n");

// ── Хелперы извлечения ───────────────────────────────────────────────────────

/** Все ключи из вызовов track("литерал") / trackProps("литерал"). */
function extractTrackLiterals(src: string): string[] {
  const re = /\btrack(?:Props)?\(\s*["']([a-z0-9_]+)["']/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) keys.push(m[1]);
  return keys;
}

/** Все ключи из data-analytics-event="..." */
function extractDataAttrKeys(src: string): string[] {
  const re = /data-analytics-event=["']([a-z0-9_]+)["']/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) keys.push(m[1]);
  return keys;
}

// Резервные/опциональные ключи, которые на конкретном сайте могут быть не подключены
// напрямую (fallback'и). При переносе на другой сайт правится здесь.
const OPTIONAL_KEYS = new Set<string>([
  // на данном сайте все ключи подключены, allowlist пуст
]);

describe("analytics contract — track() и data-attributes", () => {
  it("каждый track('литерал') использует ключ из реестра", () => {
    const used = new Set(extractTrackLiterals(ALL_SOURCE));
    const unknown = [...used].filter((k) => !ANALYTICS_EVENT_KEYS.has(k));
    expect(unknown, `неизвестные ключи в track(): ${unknown.join(", ")}`).toEqual([]);
  });

  it("каждый data-analytics-event использует ключ из реестра", () => {
    const used = new Set(extractDataAttrKeys(ALL_SOURCE));
    const unknown = [...used].filter((k) => !ANALYTICS_EVENT_KEYS.has(k));
    expect(unknown, `неизвестные ключи в data-analytics-event: ${unknown.join(", ")}`).toEqual([]);
  });

  it("каждый ключ реестра упоминается в коде (нет забытого подключения)", () => {
    const referenced = new Set<string>([
      ...extractTrackLiterals(ALL_SOURCE),
      ...extractDataAttrKeys(ALL_SOURCE),
      // ключи также могут жить в мапах (MESSENGER_TRACK_KEY, CTA_TRACK_KEY...) как 'key'
      ...[...ALL_SOURCE.matchAll(/["']([a-z0-9_]+)["']/g)].map((m) => m[1]),
    ]);

    const orphans = ANALYTICS_REGISTRY
      .map((e) => e.key)
      .filter((k) => !referenced.has(k) && !OPTIONAL_KEYS.has(k));

    expect(orphans, `ключи реестра без использования в коде: ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("analytics contract — снапшот критичных дефолтных имён", () => {
  // Эти имена завязаны на GTM-триггеры/конверсии. Случайный ренейм → падение теста.
  const CRITICAL: Record<string, string> = {
    form_submit_success: "generate_lead",
    form_submit_attempt: "lead_form_submit",
    form_open: "lead_form_open",
    header_cta_click: "cta_click",
    hero_consult_cta_click: "cta_click",
    final_cta_click: "cta_click",
    header_phone_click: "phone_click",
    contacts_telegram_click: "telegram_click",
  };

  it("критичные дефолтные имена стабильны", () => {
    for (const [key, expectedName] of Object.entries(CRITICAL)) {
      const entry = ANALYTICS_REGISTRY.find((e) => e.key === key);
      expect(entry, `нет ключа ${key} в реестре`).toBeDefined();
      expect(
        entry!.defaultEventNames,
        `дефолтное имя для ${key} изменилось — проверь GTM-триггеры`,
      ).toEqual([expectedName]);
    }
  });
});

describe("analytics contract — запобіжники VRK", () => {
  it("LeadForm трекає submit/success/error через канонічні ключі", () => {
    const src = fs.readFileSync(
      path.join(SRC_ROOT, "components", "LeadForm.tsx"),
      "utf8",
    );
    expect(src).toMatch(/track\("form_submit_attempt"/);
    expect(src).toMatch(/track\("form_submit_success"/);
    expect(src).toMatch(/track\("form_submit_error"/);
  });

  it("ModalProvider трекає відкриття форми (form_open)", () => {
    const src = fs.readFileSync(
      path.join(SRC_ROOT, "components", "ModalProvider.tsx"),
      "utf8",
    );
    expect(src).toMatch(/track\("form_open"/);
  });
});
