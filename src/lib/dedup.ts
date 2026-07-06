// Дедуплікація лідів. Викликається з /api/lead перед збереженням.
// Налаштування — у site_settings: dedup_by_phone, dedup_by_ip, dedup_ip_window_hours.
//
// Логіка (відповідає Блоку 6 промпту):
// 1. Дубль = знайдено лід з тим самим phone (нормалізованим) АБО
//    з тим самим ip в межах вікна (за замовчуванням 24 год).
// 2. При дублі: новий лід НЕ створюється, оригінал маркається is_repeat=true,
//    в lead_comments додається system-комментар з даними повторного звернення.

import { createServiceClient } from "@/lib/supabase/service";

// ── Налаштування ────────────────────────────────────────────────────────────
export type DedupSettings = {
  dedupByPhone: boolean;
  dedupByIp: boolean;
  ipWindowHours: number;
};

const DEFAULT_SETTINGS: DedupSettings = {
  dedupByPhone: true,
  dedupByIp: true,
  ipWindowHours: 24,
};

export async function getDedupSettings(): Promise<DedupSettings> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["dedup_by_phone", "dedup_by_ip", "dedup_ip_window_hours"]);

  if (error) {
    console.error("[dedup] settings_failed", error.message);
    return DEFAULT_SETTINGS;
  }

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
  const hours = parseInt(map.get("dedup_ip_window_hours") ?? "24", 10);
  return {
    dedupByPhone: (map.get("dedup_by_phone") ?? "true") === "true",
    dedupByIp: (map.get("dedup_by_ip") ?? "true") === "true",
    ipWindowHours: Number.isFinite(hours) && hours > 0 ? hours : 24,
  };
}

// ── Нормалізація телефону ────────────────────────────────────────────────────
// Zod вже гарантує формат "+380XXXXXXXXX" на вході; функція нижче — універсальна
// (стане в нагоді для Блоку 5 — телефонії, де формати різні).
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("380")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  // інший формат — повертаємо як є (з +)
  return `+${digits}`;
}

// ── Пошук дубля ──────────────────────────────────────────────────────────────
export type DedupResult =
  | { isDuplicate: false }
  | { isDuplicate: true; originalLeadId: string; reason: "phone" | "ip" };

export async function deduplicateLead(args: {
  phone: string;
  ip: string | null;
}): Promise<DedupResult> {
  const settings = await getDedupSettings();
  const supabase = createServiceClient();

  // 1. Дедуп по телефону — точне співпадіння нормалізованого номера
  if (settings.dedupByPhone) {
    const normalized = normalizePhone(args.phone);
    if (normalized) {
      const { data, error } = await supabase
        .from("leads")
        .select("id")
        .eq("phone", normalized)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) {
        console.error("[dedup] phone_lookup_failed", error.message);
      } else if (data && data.length > 0) {
        return { isDuplicate: true, originalLeadId: data[0].id as string, reason: "phone" };
      }
    }
  }

  // 2. Дедуп по IP — у межах вікна (за замовчуванням 24 год)
  if (settings.dedupByIp && args.ip) {
    const windowMs = settings.ipWindowHours * 3600 * 1000;
    const since = new Date(Date.now() - windowMs).toISOString();
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("ip_address", args.ip)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) {
      console.error("[dedup] ip_lookup_failed", error.message);
    } else if (data && data.length > 0) {
      return { isDuplicate: true, originalLeadId: data[0].id as string, reason: "ip" };
    }
  }

  return { isDuplicate: false };
}

// ── Маркування оригіналу як has-repeats + system-комментар ──────────────────
export type RepeatPayload = {
  reason: "phone" | "ip";
  service?: string | null;
  message?: string | null;
  utm?: Record<string, string | undefined> | null;
  source?: string | null;
};

export async function markAsRepeat(
  originalLeadId: string,
  payload: RepeatPayload
): Promise<void> {
  const supabase = createServiceClient();

  // Помітка на оригіналі
  const { error: updErr } = await supabase
    .from("leads")
    .update({ is_repeat: true })
    .eq("id", originalLeadId);
  if (updErr) {
    console.error("[dedup] mark_repeat_failed", updErr.message);
  }

  // System-комментар з деталями повторного звернення
  const lines: string[] = ["[ПОВТОР] Нове повторне звернення"];
  lines.push(`Причина дедупу: ${payload.reason === "phone" ? "телефон" : "IP-адреса"}`);
  if (payload.service) lines.push(`Послуга: ${payload.service}`);
  if (payload.message) lines.push(`Повідомлення: ${payload.message}`);

  const utmPairs = Object.entries(payload.utm ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
  );
  if (utmPairs.length > 0) {
    lines.push("UTM:");
    for (const [k, v] of utmPairs) lines.push(`• ${k}: ${v}`);
  }
  if (payload.source) lines.push(`Сторінка: ${payload.source}`);

  const { error: insErr } = await supabase.from("lead_comments").insert({
    lead_id: originalLeadId,
    user_id: null,
    user_email: null,
    type: "system",
    content: lines.join("\n"),
  });
  if (insErr) {
    console.error("[dedup] system_comment_failed", insErr.message);
  }
}
