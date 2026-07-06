// POST /api/lead — приймає заявки з лендингу
// Архітектура: rate limit → honeypot → валідація → Turnstile → дедуп → доставка в канали
// Принцип: НЕ блокувати юзера через зовнішні API — Promise.allSettled
//
// Відмінності від донора (усмішка):
//   • honeypot — поле `company` (у VRK `website` — реальне поле «Сайт / ніша»);
//   • додаткові поля форми VRK (website, adFormat, budget, goal, контекст блоку)
//     збираються у структурований message — окремих колонок для них немає;
//   • page (window.location.href) → source_url, контекст блоку → у message.

import { NextRequest, NextResponse } from "next/server";
import { leadSchema, type LeadInput } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/integrations/turnstile";
import { sendLeadToTelegram } from "@/lib/integrations/telegram";
import { createKeyCRMLead } from "@/lib/integrations/keycrm";
import { sendLeadEmail } from "@/lib/integrations/email";
import { createServiceClient } from "@/lib/supabase/service";
import { deduplicateLead, markAsRepeat } from "@/lib/dedup";

export const runtime = "nodejs";

function getClientIp(req: NextRequest): string {
  // x-forwarded-for може бути ланцюжком "client, proxy1, proxy2" — беремо перший
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Збирає коментар + додаткові поля форми VRK в один структурований текст. */
function buildMessage(lead: LeadInput): string | null {
  const lines: string[] = [];
  if (lead.comment) lines.push(lead.comment);
  const extras: Array<[string, string | undefined]> = [
    ["Сайт / ніша", lead.website || undefined],
    ["Формат реклами", lead.adFormat || undefined],
    ["Бюджет", lead.budget || undefined],
    ["Ціль", lead.goal || undefined],
    ["Форма", lead.source || undefined],
  ];
  const extraLines = extras
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([label, value]) => `${label}: ${value}`);
  if (extraLines.length > 0) {
    if (lines.length > 0) lines.push("—");
    lines.push(...extraLines);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. Rate limit по IP
  const { success: rateLimitOk, reset } = await checkRateLimit(ip);
  if (!rateLimitOk) {
    const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Забагато запитів. Спробуйте пізніше." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(retryAfterSeconds, 1)) },
      }
    );
  }

  // 2. Парсинг тіла запиту
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  // 3. Honeypot: якщо бот заповнив приховане поле `company` — тихо повертаємо 200
  if (
    body !== null &&
    typeof body === "object" &&
    "company" in body &&
    typeof (body as Record<string, unknown>).company === "string" &&
    ((body as Record<string, unknown>).company as string).length > 0
  ) {
    return NextResponse.json({ ok: true });
  }

  // 4. Zod-валідація
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const lead = parsed.data;

  // 5. Turnstile server-side verify
  const turnstileResult = await verifyTurnstileToken(lead.turnstileToken ?? "", ip);
  if (!turnstileResult.ok) {
    return NextResponse.json(
      { error: "Перевірка не пройдена. Оновіть сторінку." },
      { status: 403 }
    );
  }

  // Підготовка даних для інтеграцій: комбінований message з усіма полями VRK,
  // page (URL сторінки) — у полі source (так його друкують Telegram/Email/CRM).
  const message = buildMessage(lead);
  const leadData = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email || undefined,
    service: lead.service || undefined,
    comment: message ?? undefined,
    utm: lead.utm,
    source: lead.page || undefined,
  };
  const ipForDb = ip && ip !== "unknown" ? ip : null;

  // ── 6. ДЕДУПЛІКАЦІЯ ────────────────────────────────────────────────────────
  // Якщо знайдено оригінал — НЕ створюємо новий лід.
  // Натомість: оригінал маркується is_repeat=true, додаємо system-комментар,
  // надсилаємо Telegram з пометкой [ПОВТОР]. KeyCRM/Email не дублюємо.
  const dedup = await deduplicateLead({ phone: leadData.phone, ip: ipForDb });

  if (dedup.isDuplicate) {
    await markAsRepeat(dedup.originalLeadId, {
      reason: dedup.reason,
      service: leadData.service ?? null,
      message: message,
      utm: leadData.utm ?? null,
      source: leadData.source ?? null,
    });

    // Надсилаємо в Telegram з пометкой [ПОВТОР] (інші канали — пропускаємо)
    const telegramResult = await sendLeadToTelegram(leadData, { isRepeat: true });
    if (telegramResult.ok) {
      console.log("[lead] repeat_notified channel=telegram");
    } else {
      console.error("[lead] repeat_telegram_failed", telegramResult.error);
    }

    console.log(
      `[lead] duplicate_detected reason=${dedup.reason} original_id=${dedup.originalLeadId}`
    );
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // ── 7. ЗВИЧАЙНИЙ ШЛЯХ: новий лід ───────────────────────────────────────────
  // Запис в Supabase — 4-й паралельний канал.
  async function saveToSupabase() {
    try {
      const supabase = createServiceClient();

      // Беремо першу стадію з is_initial=true (по position ASC).
      // Якщо немає — fallback на системну «Новий клієнт» по імені.
      const { data: initialStage } = await supabase
        .from('lead_statuses')
        .select('id')
        .eq('is_initial', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()

      let statusId: string | null = initialStage?.id ?? null

      if (!statusId) {
        const { data: fallback } = await supabase
          .from('lead_statuses')
          .select('id')
          .eq('name', 'Новий клієнт')
          .maybeSingle()
        statusId = fallback?.id ?? null
      }

      const { error } = await supabase.from("leads").insert({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || null,
        service: lead.service || null,
        message: message,
        utm_source: lead.utm?.utm_source ?? null,
        utm_medium: lead.utm?.utm_medium ?? null,
        utm_campaign: lead.utm?.utm_campaign ?? null,
        utm_term: lead.utm?.utm_term ?? null,
        utm_content: lead.utm?.utm_content ?? null,
        gclid: lead.utm?.gclid ?? null,
        fbclid: lead.utm?.fbclid ?? null,
        ttclid: lead.utm?.ttclid ?? null,
        referrer: lead.utm?.referrer ?? null,
        source_url: lead.page ?? null,
        ip_address: ipForDb,
        user_agent: request.headers.get("user-agent") ?? null,
        status_id: statusId,
      });
      if (error) {
        console.error("[lead] supabase_failed", error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) {
      console.error("[lead] supabase_threw", e);
      return { ok: false, error: String(e) };
    }
  }

  // Паралельна доставка в усі канали — жоден збій не блокує юзера
  const [telegramResult, keycrmResult, emailResult, supabaseResult] =
    await Promise.allSettled([
      sendLeadToTelegram(leadData),
      createKeyCRMLead(leadData),
      sendLeadEmail(leadData),
      saveToSupabase(),
    ]);

  const channelNames = ["telegram", "keycrm", "email"] as const;
  const results = [telegramResult, keycrmResult, emailResult];

  let successCount = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value.ok) {
      successCount++;
      console.log(`[lead] channel_ok channel=${channelNames[i]}`);
    } else if (result.status === "fulfilled" && !result.value.ok) {
      console.error(`[lead] integration_failed:${channelNames[i]}`, result.value.error);
    } else if (result.status === "rejected") {
      console.error(`[lead] integration_threw:${channelNames[i]}`);
    }
  });

  // Supabase — рівноправний канал: якщо збережено в БД, заявка не втрачена,
  // навіть коли жодна нотифікація не налаштована (свіжий проєкт без інтеграцій).
  if (supabaseResult.status === "fulfilled" && supabaseResult.value.ok) {
    console.log("[lead] channel_ok channel=supabase");
    successCount++;
  } else {
    console.error("[lead] supabase_issue", supabaseResult);
  }

  // Критично: якщо ВСІ канали впали — повертаємо 500
  if (successCount === 0) {
    console.error("[lead] all_channels_failed");
    return NextResponse.json(
      { error: "Помилка сервера. Спробуйте пізніше або зателефонуйте нам." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
