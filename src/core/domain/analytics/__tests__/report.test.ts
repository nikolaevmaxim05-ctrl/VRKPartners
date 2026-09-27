// Тесты чистого агрегатора аналитики (промпты 020 + 022).
// Среда node, без БД — все функции чистые.
// Покрытие: таймзона Europe/Kyiv (лето/зима), ISO-недели через границы
// месяца и года, пустой период, период без лидов, семантика метрик
// (conversion_type), суммы, конверсии (деление на ноль), фильтры,
// nonTargetLeads/dealAdjustments, buildTimeseries по week/month,
// aggregateByAssignee, filterLeads по statusIds и gclid,
// группировка по custom_field_value.

import { describe, it, expect } from "vitest";
import {
  toKyivDateKey,
  toKyivWeekKey,
  toKyivMonthKey,
  getDateKey,
  getGroupKey,
  aggregateLeads,
  computeTotalRow,
  buildTimeseries,
  aggregateByAssignee,
  filterLeads,
  buildReport,
  type LeadForAggregation,
  type ReportParams,
} from "../report";

// --- Фабрика тестового лида ---
function makeLead(overrides: Partial<LeadForAggregation> = {}): LeadForAggregation {
  return {
    id: overrides.id ?? "id-1",
    created_at: overrides.created_at ?? "2026-06-11T12:00:00.000Z",
    utm_source: overrides.utm_source ?? null,
    utm_medium: overrides.utm_medium ?? null,
    utm_campaign: overrides.utm_campaign ?? null,
    utm_term: overrides.utm_term ?? null,
    utm_content: overrides.utm_content ?? null,
    gclid: overrides.gclid ?? null,
    service: overrides.service ?? null,
    assigned_to: overrides.assigned_to ?? null,
    deal_amount: overrides.deal_amount ?? null,
    deal_profit: overrides.deal_profit ?? null,
    status_conversion_type: overrides.status_conversion_type ?? null,
    status_name: overrides.status_name ?? null,
    status_id: overrides.status_id ?? null,
    status_color: overrides.status_color ?? null,
    referral_link_id: overrides.referral_link_id ?? null,
    referral_link_name: overrides.referral_link_name ?? null,
    referral_code: overrides.referral_code ?? null,
    custom_field_value: overrides.custom_field_value,
  };
}

const baseParams = (over: Partial<ReportParams> = {}): ReportParams => ({
  dateFrom: "2026-06-01",
  dateTo: "2026-06-30",
  groupBy: "day",
  ...over,
});

// ─── ТАЙМЗОНА ──────────────────────────────────────────────────────────────

describe("toKyivDateKey — таймзона Europe/Kyiv", () => {
  it("лето (UTC+3): 2026-06-10T22:30:00Z → следующий киевский день 2026-06-11", () => {
    expect(toKyivDateKey("2026-06-10T22:30:00.000Z")).toBe("2026-06-11");
  });

  it("зима (UTC+2): 2026-01-10T22:30:00Z → следующий киевский день 2026-01-11", () => {
    expect(toKyivDateKey("2026-01-10T22:30:00.000Z")).toBe("2026-01-11");
  });

  it("лето: 21:59 UTC = 00:59 следующего дня по Киеву → следующий день", () => {
    expect(toKyivDateKey("2026-06-11T21:59:00.000Z")).toBe("2026-06-12");
  });

  it("лето: 20:59 UTC = 23:59 по Киеву — тот же день", () => {
    expect(toKyivDateKey("2026-06-11T20:59:00.000Z")).toBe("2026-06-11");
  });

  it("полдень UTC не меняет дату", () => {
    expect(toKyivDateKey("2026-06-11T12:00:00.000Z")).toBe("2026-06-11");
  });
});

describe("toKyivMonthKey", () => {
  it("возвращает YYYY-MM в киевской таймзоне", () => {
    expect(toKyivMonthKey("2026-06-11T12:00:00.000Z")).toBe("2026-06");
  });

  it("сдвиг суток через таймзону переносит в следующий месяц", () => {
    expect(toKyivMonthKey("2026-06-30T22:30:00.000Z")).toBe("2026-07");
  });
});

// ─── ISO-НЕДЕЛИ ────────────────────────────────────────────────────────────

describe("toKyivWeekKey — ISO-недели через границы", () => {
  it("граница месяца: 2026-06-29 (Пн) и 2026-07-05 (Вс) — одна ISO-неделя W27", () => {
    const mon = toKyivWeekKey("2026-06-29T12:00:00.000Z");
    const sun = toKyivWeekKey("2026-07-05T12:00:00.000Z");
    expect(mon).toBe("2026-W27");
    expect(sun).toBe("2026-W27");
    expect(mon).toBe(sun);
  });

  it("граница года: 2025-12-29 (Пн) и 2026-01-04 (Вс) — одна ISO-неделя 2026-W01", () => {
    const mon = toKyivWeekKey("2025-12-29T12:00:00.000Z");
    const sun = toKyivWeekKey("2026-01-04T12:00:00.000Z");
    expect(mon).toBe("2026-W01");
    expect(sun).toBe("2026-W01");
    expect(mon).toBe(sun);
  });

  it("неделя нумеруется по четвергу: 2026-01-01 (Чт) принадлежит 2026-W01", () => {
    expect(toKyivWeekKey("2026-01-01T12:00:00.000Z")).toBe("2026-W01");
  });
});

describe("aggregateLeads groupBy=week — границы не дублируют недели", () => {
  it("лиды 2026-06-29 и 2026-07-05 (граница месяца) → одна строка", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-29T10:00:00.000Z" }),
      makeLead({ id: "2", created_at: "2026-07-05T10:00:00.000Z" }),
    ];
    const rows = aggregateLeads(leads, "week");
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("2026-W27");
    expect(rows[0].total).toBe(2);
  });

  it("лиды 2025-12-29 и 2026-01-04 (граница года) → одна строка 2026-W01", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2025-12-29T10:00:00.000Z" }),
      makeLead({ id: "2", created_at: "2026-01-04T10:00:00.000Z" }),
    ];
    const rows = aggregateLeads(leads, "week");
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("2026-W01");
    expect(rows[0].total).toBe(2);
  });
});

// ─── getDateKey / getGroupKey ──────────────────────────────────────────────

describe("getDateKey", () => {
  it("day/week/month возвращают ключи, нетемпоральные разрезы — null", () => {
    const iso = "2026-06-11T12:00:00.000Z";
    expect(getDateKey(iso, "day")).toBe("2026-06-11");
    expect(getDateKey(iso, "week")).toBe("2026-W24");
    expect(getDateKey(iso, "month")).toBe("2026-06");
    expect(getDateKey(iso, "utm_source")).toBeNull();
    expect(getDateKey(iso, "status")).toBeNull();
  });
});

describe("getGroupKey — null-значения → '(невідомо)'", () => {
  it("utm_source/service/assigned_to/status при null → '(невідомо)'", () => {
    const lead = makeLead();
    expect(getGroupKey(lead, "utm_source")).toBe("(невідомо)");
    expect(getGroupKey(lead, "service")).toBe("(невідомо)");
    expect(getGroupKey(lead, "assigned_to")).toBe("(невідомо)");
    expect(getGroupKey(lead, "status")).toBe("(невідомо)");
  });

  it("utm_medium/campaign/term/content при null → '(невідомо)'", () => {
    const lead = makeLead();
    expect(getGroupKey(lead, "utm_medium")).toBe("(невідомо)");
    expect(getGroupKey(lead, "utm_campaign")).toBe("(невідомо)");
    expect(getGroupKey(lead, "utm_term")).toBe("(невідомо)");
    expect(getGroupKey(lead, "utm_content")).toBe("(невідомо)");
  });

  it("custom_field при null/undefined custom_field_value → '(не заповнено)'", () => {
    const lead = makeLead({ custom_field_value: null });
    expect(getGroupKey(lead, "custom_field")).toBe("(не заповнено)");
    const lead2 = makeLead(); // custom_field_value=undefined
    expect(getGroupKey(lead2, "custom_field")).toBe("(не заповнено)");
  });

  it("custom_field при заполненном значении → это значение", () => {
    const lead = makeLead({ custom_field_value: "Премій клас" });
    expect(getGroupKey(lead, "custom_field")).toBe("Премій клас");
  });

  it("status группируется по status_id", () => {
    const lead = makeLead({ status_id: "st-42", status_name: "Угода" });
    expect(getGroupKey(lead, "status")).toBe("st-42");
  });
});

// ─── СЕМАНТИКА МЕТРИК ──────────────────────────────────────────────────────

describe("aggregateLeads — семантика метрик через conversion_type", () => {
  // 3 target_lead, 2 deal, 1 non_target_lead, 1 null, 1 deal_adjustment
  const leads = [
    makeLead({ id: "t1", status_conversion_type: "target_lead" }),
    makeLead({ id: "t2", status_conversion_type: "target_lead" }),
    makeLead({ id: "t3", status_conversion_type: "target_lead" }),
    makeLead({ id: "d1", status_conversion_type: "deal", deal_amount: 1000, deal_profit: 300 }),
    makeLead({ id: "d2", status_conversion_type: "deal", deal_amount: 2000, deal_profit: 700 }),
    makeLead({ id: "n1", status_conversion_type: "non_target_lead" }),
    makeLead({ id: "x1", status_conversion_type: null }),
    makeLead({ id: "adj", status_conversion_type: "deal_adjustment", deal_amount: 500, deal_profit: 100 }),
  ];

  it("target_lead, non_target_lead, deal, deal_adjustment считаются раздельно", () => {
    const rows = aggregateLeads(leads, "utm_source");
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.total).toBe(8);
    expect(r.targetLeads).toBe(3);
    expect(r.nonTargetLeads).toBe(1);
    expect(r.deals).toBe(2);
    expect(r.dealAdjustments).toBe(1);
  });

  it("суммы deal_amount и deal_profit включают все лиды с непустыми значениями", () => {
    const rows = aggregateLeads(leads, "utm_source");
    const r = rows[0];
    expect(r.dealAmountSum).toBe(3500); // 1000 + 2000 + 500
    expect(r.dealProfitSum).toBe(1100); // 300 + 700 + 100
  });

  it("проценты конверсий считаются от total", () => {
    const rows = aggregateLeads(leads, "utm_source");
    const r = rows[0];
    expect(r.conversionToTarget).toBeCloseTo((3 / 8) * 100, 6);
    expect(r.conversionToDeal).toBeCloseTo((2 / 8) * 100, 6);
    expect(r.conversionToNonTarget).toBeCloseTo((1 / 8) * 100, 6);
  });
});

describe("aggregateLeads — новые метрики nonTargetLeads и dealAdjustments", () => {
  it("nonTargetLeads считается правильно при разных источниках", () => {
    const leads = [
      makeLead({ id: "1", utm_source: "google", status_conversion_type: "non_target_lead" }),
      makeLead({ id: "2", utm_source: "google", status_conversion_type: "target_lead" }),
      makeLead({ id: "3", utm_source: "fb",     status_conversion_type: "non_target_lead" }),
    ];
    const rows = aggregateLeads(leads, "utm_source");
    const google = rows.find((r) => r.key === "google")!;
    const fb     = rows.find((r) => r.key === "fb")!;
    expect(google.nonTargetLeads).toBe(1);
    expect(google.targetLeads).toBe(1);
    expect(fb.nonTargetLeads).toBe(1);
  });

  it("dealAdjustments считается правильно, не попадает в deals", () => {
    const leads = [
      makeLead({ id: "1", status_conversion_type: "deal_adjustment" }),
      makeLead({ id: "2", status_conversion_type: "deal_adjustment" }),
      makeLead({ id: "3", status_conversion_type: "deal" }),
    ];
    const rows = aggregateLeads(leads, "utm_source");
    expect(rows[0].dealAdjustments).toBe(2);
    expect(rows[0].deals).toBe(1);
  });

  it("conversionToNonTarget = nonTargetLeads/total*100", () => {
    const leads = [
      makeLead({ id: "1", status_conversion_type: "non_target_lead" }),
      makeLead({ id: "2", status_conversion_type: "non_target_lead" }),
      makeLead({ id: "3", status_conversion_type: "target_lead" }),
      makeLead({ id: "4", status_conversion_type: null }),
    ];
    const rows = aggregateLeads(leads, "utm_source");
    const r = rows[0];
    expect(r.conversionToNonTarget).toBeCloseTo(50, 6); // 2/4*100
  });
});

describe("aggregateLeads — деление на ноль не даёт NaN", () => {
  it("строка без лидов невозможна, но конверсии всегда числа (total>0)", () => {
    const rows = aggregateLeads([makeLead()], "utm_source");
    expect(Number.isNaN(rows[0].conversionToTarget)).toBe(false);
    expect(Number.isNaN(rows[0].conversionToDeal)).toBe(false);
    expect(Number.isNaN(rows[0].conversionToNonTarget)).toBe(false);
    expect(rows[0].conversionToTarget).toBe(0);
  });

  it("сортировка строк DESC по total", () => {
    const leads = [
      makeLead({ id: "1", utm_source: "google" }),
      makeLead({ id: "2", utm_source: "google" }),
      makeLead({ id: "3", utm_source: "facebook" }),
    ];
    const rows = aggregateLeads(leads, "utm_source");
    expect(rows[0].key).toBe("google");
    expect(rows[0].total).toBe(2);
    expect(rows[1].key).toBe("facebook");
  });

  it("labelMap и colorMap применяются для status", () => {
    const leads = [makeLead({ status_id: "st-1", status_conversion_type: "deal" })];
    const rows = aggregateLeads(leads, "status", { "st-1": "Угода" }, { "st-1": "#10b981" });
    expect(rows[0].label).toBe("Угода");
    expect(rows[0].color).toBe("#10b981");
  });
});

// ─── Группировка по custom_field ───────────────────────────────────────────

describe("aggregateLeads groupBy=custom_field", () => {
  it("группирует по custom_field_value, null → '(не заповнено)'", () => {
    const leads = [
      makeLead({ id: "1", custom_field_value: "VIP" }),
      makeLead({ id: "2", custom_field_value: "VIP" }),
      makeLead({ id: "3", custom_field_value: null }),
      makeLead({ id: "4", custom_field_value: undefined }),
    ];
    const rows = aggregateLeads(leads, "custom_field");
    expect(rows).toHaveLength(2);
    const vip     = rows.find((r) => r.key === "VIP")!;
    const unknown = rows.find((r) => r.key === "(не заповнено)")!;
    expect(vip.total).toBe(2);
    expect(unknown.total).toBe(2);
  });

  it("label совпадает с key (не берётся из labelMap)", () => {
    const leads = [makeLead({ custom_field_value: "Преміум" })];
    const rows = aggregateLeads(leads, "custom_field");
    // key = 'Преміум', labelMap пустой → label = key
    expect(rows[0].key).toBe("Преміум");
    expect(rows[0].label).toBe("Преміум");
  });
});

// ─── computeTotalRow ───────────────────────────────────────────────────────

describe("computeTotalRow", () => {
  it("пустой массив строк → все нули, конверсии 0 (не NaN/Infinity)", () => {
    const total = computeTotalRow([]);
    expect(total.key).toBe("__total__");
    expect(total.label).toBe("Разом");
    expect(total.total).toBe(0);
    expect(total.targetLeads).toBe(0);
    expect(total.nonTargetLeads).toBe(0);
    expect(total.deals).toBe(0);
    expect(total.dealAdjustments).toBe(0);
    expect(total.dealAmountSum).toBe(0);
    expect(total.dealProfitSum).toBe(0);
    expect(total.conversionToTarget).toBe(0);
    expect(total.conversionToDeal).toBe(0);
    expect(total.conversionToNonTarget).toBe(0);
    expect(Number.isNaN(total.conversionToTarget)).toBe(false);
    expect(Number.isFinite(total.conversionToTarget)).toBe(true);
  });

  it("суммирует строки и пересчитывает конверсии от общего total", () => {
    const rows = aggregateLeads(
      [
        makeLead({ id: "1", utm_source: "google", status_conversion_type: "target_lead" }),
        makeLead({ id: "2", utm_source: "google", status_conversion_type: "deal", deal_amount: 1000, deal_profit: 400 }),
        makeLead({ id: "3", utm_source: "facebook", status_conversion_type: "non_target_lead" }),
        makeLead({ id: "4", utm_source: "facebook" }),
      ],
      "utm_source",
    );
    const total = computeTotalRow(rows);
    expect(total.total).toBe(4);
    expect(total.targetLeads).toBe(1);
    expect(total.nonTargetLeads).toBe(1);
    expect(total.deals).toBe(1);
    expect(total.dealAmountSum).toBe(1000);
    expect(total.dealProfitSum).toBe(400);
    expect(total.conversionToTarget).toBeCloseTo((1 / 4) * 100, 6);
    expect(total.conversionToDeal).toBeCloseTo((1 / 4) * 100, 6);
    expect(total.conversionToNonTarget).toBeCloseTo((1 / 4) * 100, 6);
  });

  it("суммирует dealAdjustments из строк", () => {
    const leads = [
      makeLead({ id: "1", utm_source: "g", status_conversion_type: "deal_adjustment" }),
      makeLead({ id: "2", utm_source: "g", status_conversion_type: "deal_adjustment" }),
    ];
    const rows = aggregateLeads(leads, "utm_source");
    const total = computeTotalRow(rows);
    expect(total.dealAdjustments).toBe(2);
  });
});

// ─── buildTimeseries — по days ─────────────────────────────────────────────

describe("buildTimeseries — granularity=day (default)", () => {
  it("период без лидов → все дни диапазона заполнены нулями", () => {
    const ts = buildTimeseries([], "2026-06-01", "2026-06-05");
    expect(ts).toHaveLength(5);
    expect(ts.map((d) => d.dateIso)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    for (const d of ts) {
      expect(d.total).toBe(0);
      expect(d.targetLeads).toBe(0);
      expect(d.nonTargetLeads).toBe(0);
    }
  });

  it("лид с 22:30Z (лето) попадает в следующий киевский день", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-10T22:30:00.000Z", status_conversion_type: "target_lead" }),
    ];
    const ts = buildTimeseries(leads, "2026-06-09", "2026-06-12");
    const d10 = ts.find((d) => d.dateIso === "2026-06-10")!;
    const d11 = ts.find((d) => d.dateIso === "2026-06-11")!;
    expect(d10.total).toBe(0);
    expect(d11.total).toBe(1);
    expect(d11.targetLeads).toBe(1);
    expect(d11.nonTargetLeads).toBe(0);
  });

  it("nonTargetLeads в таймсерии = лиды с conversion_type='non_target_lead'", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-11T10:00:00.000Z", status_conversion_type: "target_lead" }),
      makeLead({ id: "2", created_at: "2026-06-11T11:00:00.000Z", status_conversion_type: "non_target_lead" }),
      makeLead({ id: "3", created_at: "2026-06-11T12:00:00.000Z", status_conversion_type: null }),
    ];
    const ts = buildTimeseries(leads, "2026-06-11", "2026-06-11");
    expect(ts).toHaveLength(1);
    expect(ts[0].total).toBe(3);
    expect(ts[0].targetLeads).toBe(1);
    expect(ts[0].nonTargetLeads).toBe(1); // только non_target_lead, не всё что не target
  });

  it("dealAdjustments в таймсерии корректно агрегируется", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-11T10:00:00.000Z", status_conversion_type: "deal_adjustment", deal_amount: 100 }),
    ];
    const ts = buildTimeseries(leads, "2026-06-11", "2026-06-11");
    expect(ts[0].dealAdjustments).toBe(1);
    expect(ts[0].dealAmountSum).toBe(100);
  });

  it("метка (label) в формате 'dd.MM'", () => {
    const ts = buildTimeseries([], "2026-06-09", "2026-06-09");
    expect(ts[0].label).toBe("09.06");
    expect(ts[0].dateIso).toBe("2026-06-09");
  });
});

// ─── buildTimeseries — по weeks ─────────────────────────────────────────────

describe("buildTimeseries — granularity=week", () => {
  it("пустой период → бакеты недель без пропусков", () => {
    // 2026-06-01 (Пн) по 2026-06-14 (Вс) — ровно 2 ISO-недели: W23 и W24
    const ts = buildTimeseries([], "2026-06-01", "2026-06-14", "week");
    expect(ts).toHaveLength(2);
    expect(ts[0].dateIso).toBe("2026-W23");
    expect(ts[1].dateIso).toBe("2026-W24");
  });

  it("метка недели — 'Тиж. NN'", () => {
    const ts = buildTimeseries([], "2026-06-01", "2026-06-07", "week");
    expect(ts[0].label).toMatch(/^Тиж\. \d+$/);
  });

  it("ISO-неделя через границу года: 2025-12-29 — 2026-01-04 → один бакет 2026-W01", () => {
    const ts = buildTimeseries([], "2025-12-29", "2026-01-04", "week");
    expect(ts).toHaveLength(1);
    expect(ts[0].dateIso).toBe("2026-W01");
    expect(ts[0].label).toBe("Тиж. 01");
  });

  it("ISO-неделя через границу месяца: 2026-06-29 — 2026-07-05 → один бакет 2026-W27", () => {
    const ts = buildTimeseries([], "2026-06-29", "2026-07-05", "week");
    expect(ts).toHaveLength(1);
    expect(ts[0].dateIso).toBe("2026-W27");
  });

  it("лиды группируются по неделям", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-01T10:00:00.000Z", status_conversion_type: "target_lead" }),
      makeLead({ id: "2", created_at: "2026-06-08T10:00:00.000Z", status_conversion_type: "deal" }),
      makeLead({ id: "3", created_at: "2026-06-09T10:00:00.000Z", status_conversion_type: "non_target_lead" }),
    ];
    const ts = buildTimeseries(leads, "2026-06-01", "2026-06-14", "week");
    // W23 (01.06-07.06) и W24 (08.06-14.06)
    const w23 = ts.find((p) => p.dateIso === "2026-W23")!;
    const w24 = ts.find((p) => p.dateIso === "2026-W24")!;
    expect(w23.total).toBe(1);
    expect(w23.targetLeads).toBe(1);
    expect(w24.total).toBe(2);
    expect(w24.deals).toBe(1);
    expect(w24.nonTargetLeads).toBe(1);
  });

  it("пустые бакеты в середине диапазона заполнены нулями", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-01T10:00:00.000Z" }), // W23
      // пропускаем W24
      makeLead({ id: "2", created_at: "2026-06-15T10:00:00.000Z" }), // W25
    ];
    const ts = buildTimeseries(leads, "2026-06-01", "2026-06-21", "week");
    const w24 = ts.find((p) => p.dateIso === "2026-W24")!;
    expect(w24).toBeTruthy();
    expect(w24.total).toBe(0);
  });
});

// ─── buildTimeseries — по months ──────────────────────────────────────────

describe("buildTimeseries — granularity=month", () => {
  it("пустой период → бакеты месяцев без пропусков", () => {
    const ts = buildTimeseries([], "2026-01-01", "2026-03-31", "month");
    expect(ts).toHaveLength(3);
    expect(ts.map((p) => p.dateIso)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("метка месяца — 'MM.YYYY'", () => {
    const ts = buildTimeseries([], "2026-06-01", "2026-06-30", "month");
    expect(ts[0].label).toBe("06.2026");
  });

  it("лиды группируются по месяцам", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-01-15T10:00:00.000Z", status_conversion_type: "target_lead" }),
      makeLead({ id: "2", created_at: "2026-01-20T10:00:00.000Z", status_conversion_type: "deal" }),
      makeLead({ id: "3", created_at: "2026-02-10T10:00:00.000Z", status_conversion_type: "non_target_lead" }),
    ];
    const ts = buildTimeseries(leads, "2026-01-01", "2026-02-28", "month");
    expect(ts).toHaveLength(2);
    const jan = ts.find((p) => p.dateIso === "2026-01")!;
    const feb = ts.find((p) => p.dateIso === "2026-02")!;
    expect(jan.total).toBe(2);
    expect(jan.targetLeads).toBe(1);
    expect(jan.deals).toBe(1);
    expect(feb.total).toBe(1);
    expect(feb.nonTargetLeads).toBe(1);
  });

  it("граница года: 2025-12 → 2026-02 — бакеты не схлопываются по номеру месяца", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2025-12-15T10:00:00.000Z", status_conversion_type: "deal", deal_amount: 100 }),
      makeLead({ id: "2", created_at: "2026-01-15T10:00:00.000Z", status_conversion_type: "target_lead" }),
      makeLead({ id: "3", created_at: "2026-12-15T10:00:00.000Z", status_conversion_type: "deal", deal_amount: 200 }),
    ];
    const ts = buildTimeseries(leads, "2025-12-01", "2026-02-28", "month");
    expect(ts.map((p) => p.dateIso)).toEqual(["2025-12", "2026-01", "2026-02"]);
    const dec2025 = ts.find((p) => p.dateIso === "2025-12")!;
    const jan2026 = ts.find((p) => p.dateIso === "2026-01")!;
    // лид 3 (2026-12) вне диапазона генерации бакетов — не должен слиться с 2025-12
    expect(dec2025.total).toBe(1);
    expect(dec2025.dealAmountSum).toBe(100);
    expect(jan2026.total).toBe(1);
    expect(jan2026.targetLeads).toBe(1);
  });

  it("декабрь конца года в одиночном диапазоне корректен", () => {
    const ts = buildTimeseries([], "2025-12-01", "2025-12-31", "month");
    expect(ts).toHaveLength(1);
    expect(ts[0].dateIso).toBe("2025-12");
    expect(ts[0].label).toBe("12.2025");
  });

  it("пустой месяц в середине диапазона → нули", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-01-01T10:00:00.000Z" }),
      makeLead({ id: "2", created_at: "2026-03-01T10:00:00.000Z" }),
    ];
    const ts = buildTimeseries(leads, "2026-01-01", "2026-03-31", "month");
    const feb = ts.find((p) => p.dateIso === "2026-02")!;
    expect(feb.total).toBe(0);
  });
});

// ─── aggregateByAssignee ───────────────────────────────────────────────────

describe("aggregateByAssignee", () => {
  const leads = [
    makeLead({ id: "1", assigned_to: "u1", status_conversion_type: "target_lead" }),
    makeLead({ id: "2", assigned_to: "u1", status_conversion_type: "deal", deal_amount: 1000 }),
    makeLead({ id: "3", assigned_to: "u2", status_conversion_type: "non_target_lead" }),
    makeLead({ id: "4", assigned_to: null, status_conversion_type: null }),
    makeLead({ id: "5", assigned_to: null }),
  ];
  const labelMap = { u1: "Іван Коваль", u2: "Олена Мороз" };

  it("сортировка по total DESC, __unassigned__ всегда последний", () => {
    const rows = aggregateByAssignee(leads, labelMap);
    expect(rows[0].key).toBe("u1");   // 2 лида
    expect(rows[1].key).toBe("u2");   // 1 лид
    expect(rows[2].key).toBe("__unassigned__"); // 2 лида, но всегда последний
  });

  it("label берётся из labelMap", () => {
    const rows = aggregateByAssignee(leads, labelMap);
    expect(rows.find((r) => r.key === "u1")!.label).toBe("Іван Коваль");
    expect(rows.find((r) => r.key === "u2")!.label).toBe("Олена Мороз");
    expect(rows.find((r) => r.key === "__unassigned__")!.label).toBe("Без відповідального");
  });

  it("метрики агрегируются корректно", () => {
    const rows = aggregateByAssignee(leads, labelMap);
    const u1 = rows.find((r) => r.key === "u1")!;
    expect(u1.total).toBe(2);
    expect(u1.targetLeads).toBe(1);
    expect(u1.deals).toBe(1);
    expect(u1.dealAmountSum).toBe(1000);
    const u2 = rows.find((r) => r.key === "u2")!;
    expect(u2.nonTargetLeads).toBe(1);
  });

  it("__unassigned__ отсутствует если нет неназначенных лидов", () => {
    const assignedOnly = [
      makeLead({ id: "1", assigned_to: "u1" }),
    ];
    const rows = aggregateByAssignee(assignedOnly, {});
    expect(rows.find((r) => r.key === "__unassigned__")).toBeUndefined();
  });

  it("если есть только неназначенные — один элемент __unassigned__", () => {
    const unassignedOnly = [
      makeLead({ id: "1", assigned_to: null }),
      makeLead({ id: "2", assigned_to: null }),
    ];
    const rows = aggregateByAssignee(unassignedOnly, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("__unassigned__");
    expect(rows[0].total).toBe(2);
  });

  it("если labelMap без ключа — fallback на userId", () => {
    const rows = aggregateByAssignee([makeLead({ assigned_to: "u-unknown" })], {});
    expect(rows[0].label).toBe("u-unknown");
  });
});

// ─── filterLeads ───────────────────────────────────────────────────────────

describe("filterLeads — реферальне посилання", () => {
  const leads = [
    makeLead({ id: "1", referral_link_id: "r1", referral_link_name: "Партнер А" }),
    makeLead({ id: "2" }),
    makeLead({ id: "3", referral_link_id: "r2", referral_link_name: "Партнер Б" }),
  ];

  it("getGroupKey('referral_link'): id посилання або '(без посилання)'", () => {
    expect(getGroupKey(leads[0], "referral_link")).toBe("r1");
    expect(getGroupKey(leads[1], "referral_link")).toBe("(без посилання)");
  });

  it("filterReferralLinkId=UUID → лише це посилання; 'none' → лише без посилання; порожній → всі", () => {
    expect(filterLeads(leads, { filterReferralLinkId: "r1" }).map((l) => l.id)).toEqual(["1"]);
    expect(filterLeads(leads, { filterReferralLinkId: "none" }).map((l) => l.id)).toEqual(["2"]);
    expect(filterLeads(leads, { filterReferralLinkId: "" })).toHaveLength(3);
  });

  it("aggregateLeads по referral_link: підпис з labelMap, ключ без посилання лишається ключем без мапи", () => {
    const rows = aggregateLeads(leads, "referral_link", { r1: "Партнер А", r2: "Партнер Б" });
    expect(rows.map((r) => [r.key, r.label, r.total])).toEqual([
      ["r1", "Партнер А", 1], ["(без посилання)", "(без посилання)", 1], ["r2", "Партнер Б", 1],
    ]);
  });
});

describe("filterLeads — базовые фильтры", () => {
  const leads = [
    makeLead({ id: "1", utm_source: "google", service: "implant", assigned_to: "u1" }),
    makeLead({ id: "2", utm_source: "facebook", service: "implant", assigned_to: "u2" }),
    makeLead({ id: "3", utm_source: "google", service: "whitening", assigned_to: "u1" }),
  ];

  it("фильтр по utm_source", () => {
    const r = filterLeads(leads, { filterUtmSource: "google" });
    expect(r.map((l) => l.id)).toEqual(["1", "3"]);
  });

  it("фильтр по service", () => {
    const r = filterLeads(leads, { filterService: "implant" });
    expect(r.map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("фильтр по assigned_to", () => {
    const r = filterLeads(leads, { filterAssignedTo: "u1" });
    expect(r.map((l) => l.id)).toEqual(["1", "3"]);
  });

  it("комбинация фильтров (AND)", () => {
    const r = filterLeads(leads, { filterUtmSource: "google", filterService: "whitening" });
    expect(r.map((l) => l.id)).toEqual(["3"]);
  });

  it("пустые фильтры → все лиды; вход не мутируется", () => {
    const r = filterLeads(leads, {});
    expect(r).toHaveLength(3);
    expect(r).not.toBe(leads);
  });
});

describe("filterLeads — по statusIds (multi)", () => {
  const leads = [
    makeLead({ id: "1", status_id: "st-1" }),
    makeLead({ id: "2", status_id: "st-2" }),
    makeLead({ id: "3", status_id: "st-3" }),
    makeLead({ id: "4", status_id: null }),
  ];

  it("filterStatusIds пустой → все лиды", () => {
    const r = filterLeads(leads, { filterStatusIds: [] });
    expect(r).toHaveLength(4);
  });

  it("filterStatusIds с одним id → только лиды с этой стадией", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-1"] });
    expect(r.map((l) => l.id)).toEqual(["1"]);
  });

  it("filterStatusIds с несколькими id", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-1", "st-3"] });
    expect(r.map((l) => l.id)).toEqual(["1", "3"]);
  });

  it("лид с status_id=null не проходит filterStatusIds", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-1"] });
    expect(r.find((l) => l.id === "4")).toBeUndefined();
  });
});

describe("filterLeads — по gclid", () => {
  const leads = [
    makeLead({ id: "1", gclid: "abc123" }),
    makeLead({ id: "2", gclid: "def456" }),
    makeLead({ id: "3", gclid: null }),
    makeLead({ id: "4", gclid: "" }),
  ];

  it("filterGclid='any' → все лиды", () => {
    const r = filterLeads(leads, { filterGclid: "any" });
    expect(r).toHaveLength(4);
  });

  it("filterGclid='with' → только лиды с непустым gclid", () => {
    const r = filterLeads(leads, { filterGclid: "with" });
    expect(r.map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("filterGclid='without' → только лиды без gclid (null или пустая строка — нет gclid)", () => {
    // "" — falsy, так что тоже попадает
    const r = filterLeads(leads, { filterGclid: "without" });
    expect(r.map((l) => l.id)).toEqual(["3", "4"]);
  });

  it("filterGclid не задан (undefined) → все лиды", () => {
    const r = filterLeads(leads, {});
    expect(r).toHaveLength(4);
  });
});

// ─── buildReport (интеграция чистых функций) ──────────────────────────────

describe("buildReport — пустой период", () => {
  it("dateFrom > dateTo → rows пустые, total нули, timeseries не падает (пустой)", () => {
    const report = buildReport([], baseParams({ dateFrom: "2026-06-30", dateTo: "2026-06-01" }));
    expect(report.rows).toEqual([]);
    expect(report.total.total).toBe(0);
    expect(report.total.conversionToTarget).toBe(0);
    expect(report.total.nonTargetLeads).toBe(0);
    expect(report.filteredCount).toBe(0);
    expect(report.timeseries).toEqual([]);
    expect(report.byAssignee).toEqual([]);
  });

  it("нет лидов, корректный диапазон → rows пустые, timeseries заполнен нулями по дням", () => {
    const report = buildReport([], baseParams({ dateFrom: "2026-06-01", dateTo: "2026-06-03" }));
    expect(report.rows).toEqual([]);
    expect(report.total.total).toBe(0);
    expect(report.timeseries).toHaveLength(3);
    expect(report.timeseries.every((d) => d.total === 0)).toBe(true);
  });
});

describe("buildReport — полный сценарий", () => {
  const leads = [
    makeLead({ id: "1", created_at: "2026-06-05T10:00:00.000Z", utm_source: "google", assigned_to: "u1", status_conversion_type: "target_lead" }),
    makeLead({ id: "2", created_at: "2026-06-05T11:00:00.000Z", utm_source: "google", assigned_to: "u1", status_conversion_type: "deal", deal_amount: 5000, deal_profit: 1500 }),
    makeLead({ id: "3", created_at: "2026-06-06T10:00:00.000Z", utm_source: "facebook", assigned_to: "u2", status_conversion_type: "non_target_lead" }),
    // лид вне фильтра по источнику — отфильтруется
    makeLead({ id: "4", created_at: "2026-06-06T12:00:00.000Z", utm_source: "tiktok", assigned_to: null, status_conversion_type: "target_lead" }),
  ];

  it("применяет фильтр, агрегирует по utm_source, считает total и filteredCount", () => {
    const report = buildReport(
      leads,
      baseParams({ groupBy: "utm_source", filterUtmSource: "google" }),
    );
    expect(report.filteredCount).toBe(2);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].key).toBe("google");
    expect(report.rows[0].total).toBe(2);
    expect(report.rows[0].targetLeads).toBe(1);
    expect(report.rows[0].deals).toBe(1);
    expect(report.rows[0].dealAmountSum).toBe(5000);
    expect(report.total.total).toBe(2);
  });

  it("byAssignee строится на отфильтрованных лидах", () => {
    const report = buildReport(
      leads,
      baseParams({ groupBy: "utm_source", filterUtmSource: "google" }),
      { u1: "Іван" },
    );
    // После фильтра: 2 лида, оба assigned_to u1
    expect(report.byAssignee).toHaveLength(1);
    expect(report.byAssignee[0].key).toBe("u1");
    expect(report.byAssignee[0].label).toBe("Іван");
  });

  it("timeseries строится по всему отфильтрованному периоду (нули в днях без лидов)", () => {
    const report = buildReport(
      leads,
      baseParams({ dateFrom: "2026-06-04", dateTo: "2026-06-07", groupBy: "utm_source", filterUtmSource: "google" }),
    );
    const d4 = report.timeseries.find((d) => d.dateIso === "2026-06-04")!;
    const d5 = report.timeseries.find((d) => d.dateIso === "2026-06-05")!;
    expect(report.timeseries).toHaveLength(4);
    expect(d4.total).toBe(0);
    expect(d5.total).toBe(2);
    expect(d5.targetLeads).toBe(1);
  });

  it("params возвращаются в ответе", () => {
    const params = baseParams({ groupBy: "month" });
    const report = buildReport(leads, params);
    expect(report.params).toEqual(params);
  });

  it("flags передаются в ответ", () => {
    const flags = { hasProfitStages: true, hasDealAdjustmentStages: false };
    const report = buildReport([], baseParams(), {}, {}, flags);
    expect(report.flags).toEqual(flags);
  });

  it("flags по умолчанию false/false", () => {
    const report = buildReport([], baseParams());
    expect(report.flags.hasProfitStages).toBe(false);
    expect(report.flags.hasDealAdjustmentStages).toBe(false);
  });
});

// ─── Согласованность byAssignee с total-строкой (промпт 022, п.4) ──────────

describe("buildReport — byAssignee согласуется с rows-тоталами", () => {
  // На одном наборе лидов сумма по byAssignee == сумма по total-строке.
  const leads = [
    makeLead({ id: "1", created_at: "2026-06-05T10:00:00.000Z", utm_source: "google",   assigned_to: "u1", status_conversion_type: "target_lead",     deal_amount: 100, deal_profit: 40 }),
    makeLead({ id: "2", created_at: "2026-06-05T11:00:00.000Z", utm_source: "google",   assigned_to: "u1", status_conversion_type: "deal",            deal_amount: 5000, deal_profit: 1500 }),
    makeLead({ id: "3", created_at: "2026-06-06T10:00:00.000Z", utm_source: "facebook", assigned_to: "u2", status_conversion_type: "non_target_lead" }),
    makeLead({ id: "4", created_at: "2026-06-06T12:00:00.000Z", utm_source: "tiktok",   assigned_to: null, status_conversion_type: "deal_adjustment", deal_amount: 300, deal_profit: 90 }),
    makeLead({ id: "5", created_at: "2026-06-07T12:00:00.000Z", utm_source: "tiktok",   assigned_to: "u2", status_conversion_type: "target_lead" }),
  ];

  function sumAssignee<K extends keyof ReturnType<typeof buildReport>["byAssignee"][number]>(
    report: ReturnType<typeof buildReport>,
    field: K,
  ): number {
    return report.byAssignee.reduce((acc, r) => acc + (r[field] as number), 0);
  }

  it("сумма byAssignee по каждой метрике == total-строка (groupBy=utm_source)", () => {
    const report = buildReport(leads, baseParams({ groupBy: "utm_source" }), { u1: "Іван", u2: "Олена" });
    expect(sumAssignee(report, "total")).toBe(report.total.total);
    expect(sumAssignee(report, "targetLeads")).toBe(report.total.targetLeads);
    expect(sumAssignee(report, "nonTargetLeads")).toBe(report.total.nonTargetLeads);
    expect(sumAssignee(report, "deals")).toBe(report.total.deals);
    expect(sumAssignee(report, "dealAdjustments")).toBe(report.total.dealAdjustments);
    expect(sumAssignee(report, "dealAmountSum")).toBe(report.total.dealAmountSum);
    expect(sumAssignee(report, "dealProfitSum")).toBe(report.total.dealProfitSum);
  });

  it("согласованность сохраняется при groupBy=assigned_to (rows и byAssignee — один набор)", () => {
    const report = buildReport(leads, baseParams({ groupBy: "assigned_to" }), { u1: "Іван", u2: "Олена" });
    // rows тоже по assigned_to → суммы rows == суммы byAssignee
    const rowsTotal = report.rows.reduce((a, r) => a + r.total, 0);
    expect(sumAssignee(report, "total")).toBe(rowsTotal);
    expect(sumAssignee(report, "total")).toBe(report.total.total);
    expect(sumAssignee(report, "dealAmountSum")).toBe(report.total.dealAmountSum);
  });

  it("согласованность сохраняется после фильтра (byAssignee на отфильтрованных)", () => {
    const report = buildReport(
      leads,
      baseParams({ groupBy: "utm_source", filterGclid: "any", filterStatusIds: [] }),
      { u1: "Іван", u2: "Олена" },
    );
    expect(sumAssignee(report, "total")).toBe(report.total.total);
    // __unassigned__ присутствует (лид 4 без assigned_to)
    expect(report.byAssignee.some((r) => r.key === "__unassigned__")).toBe(true);
  });
});

// ─── Комбинация filterStatusIds + filterGclid (промпт 022, п.4) ────────────

describe("filterLeads — filterStatusIds + filterGclid комбинируются (AND)", () => {
  const leads = [
    makeLead({ id: "1", status_id: "st-1", gclid: "g1" }),
    makeLead({ id: "2", status_id: "st-1", gclid: null }),
    makeLead({ id: "3", status_id: "st-2", gclid: "g2" }),
    makeLead({ id: "4", status_id: "st-2", gclid: null }),
    makeLead({ id: "5", status_id: null,  gclid: "g3" }),
  ];

  it("статус st-1 И gclid='with' → только лид 1", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-1"], filterGclid: "with" });
    expect(r.map((l) => l.id)).toEqual(["1"]);
  });

  it("статусы st-1,st-2 И gclid='without' → лиды 2 и 4", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-1", "st-2"], filterGclid: "without" });
    expect(r.map((l) => l.id)).toEqual(["2", "4"]);
  });

  it("статус st-2 И gclid='with' → только лид 3", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-2"], filterGclid: "with" });
    expect(r.map((l) => l.id)).toEqual(["3"]);
  });

  it("комбинация, дающая пустой результат (st-1 + status=null невозможен)", () => {
    const r = filterLeads(leads, { filterStatusIds: ["st-no-such"], filterGclid: "with" });
    expect(r).toHaveLength(0);
  });
});

// ─── buildReport с custom_field группировкой и '(не заповнено)' (п.4) ───────

describe("buildReport — groupBy=custom_field полный путь", () => {
  it("группирует по custom_field_value, '(не заповнено)' попадает в total и byAssignee", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-05T10:00:00.000Z", assigned_to: "u1", custom_field_value: "VIP", status_conversion_type: "deal", deal_amount: 1000 }),
      makeLead({ id: "2", created_at: "2026-06-05T10:00:00.000Z", assigned_to: "u1", custom_field_value: "VIP", status_conversion_type: "target_lead" }),
      makeLead({ id: "3", created_at: "2026-06-06T10:00:00.000Z", assigned_to: "u2", custom_field_value: null,  status_conversion_type: "non_target_lead" }),
    ];
    const report = buildReport(leads, baseParams({ groupBy: "custom_field", customFieldId: "00000000-0000-0000-0000-000000000001" }), { u1: "Іван", u2: "Олена" });
    const vip     = report.rows.find((r) => r.key === "VIP")!;
    const empty   = report.rows.find((r) => r.key === "(не заповнено)")!;
    expect(vip.total).toBe(2);
    expect(vip.deals).toBe(1);
    expect(vip.dealAmountSum).toBe(1000);
    expect(empty.total).toBe(1);
    expect(empty.nonTargetLeads).toBe(1);
    // total согласуется
    expect(report.total.total).toBe(3);
    // byAssignee сумма == total
    const sumA = report.byAssignee.reduce((a, r) => a + r.total, 0);
    expect(sumA).toBe(report.total.total);
  });
});

describe("buildReport — tsGranularity=week передаётся в timeseries", () => {
  it("timeseries с week granularity использует ISO-недели", () => {
    const leads = [
      makeLead({ id: "1", created_at: "2026-06-01T10:00:00.000Z" }),
      makeLead({ id: "2", created_at: "2026-06-08T10:00:00.000Z" }),
    ];
    const report = buildReport(
      leads,
      baseParams({ dateFrom: "2026-06-01", dateTo: "2026-06-14", tsGranularity: "week" }),
    );
    // Должно быть 2 недели W23 и W24
    expect(report.timeseries.length).toBeGreaterThanOrEqual(2);
    const keys = report.timeseries.map((p) => p.dateIso);
    expect(keys.some((k) => k.startsWith("2026-W"))).toBe(true);
  });
});
