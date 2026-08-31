// POST /api/lead — приймає заявки з лендингу
// Архітектура: rate limit → honeypot → валідація → дедуп → доставка в канали
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
import { getClientIp } from "@/lib/ip";
import { sendLeadToTelegram } from "@/lib/integrations/telegram";
import { createKeyCRMLead } from "@/lib/integrations/keycrm";
import { sendLeadEmail } from "@/lib/integrations/email";
import { prefetchIntegrations } from "@/lib/integrations/get-integration";
import { createServiceClient } from "@/lib/supabase/service";
import { deduplicateLead, markAsRepeat } from "@/lib/dedup";

export const runtime = "nodejs";

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
  // Реальний IP клієнта (для rate-limit нижче та для запису в БД). Може бути null.
  const ip = getClientIp(request.headers);

  // 1. Парсинг тіла запиту
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  // 2. Honeypot: якщо бот заповнив приховане поле `company` — тихо повертаємо 200
  if (
    body !== null &&
    typeof body === "object" &&
    "company" in body &&
    typeof (body as Record<string, unknown>).company === "string" &&
    ((body as Record<string, unknown>).company as string).length > 0
  ) {
    return NextResponse.json({ ok: true });
  }

  // 3. Zod-валідація
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const lead = parsed.data;

  // 4. Rate limit — САМЕ ТУТ, ПІСЛЯ honeypot + Zod: рахуємо лише валідні сабміти,
  // тож боти (honeypot) і невалідні запити (400) НЕ з'їдають квоту, а серія ретраїв
  // після помилки форми не «випалює» ліміт користувача. Ключ — реальний IP клієнта.
  // Якщо IP не визначено — НЕ вводимо спільний ключ-константу (це загнало б усіх
  // відвідувачів в один лічильник), а пропускаємо ліміт із попередженням.
  // Лог без сирого IP (PII) — щоб звірити наявність заголовків у логах Vercel.
  console.log("[lead] rl_headers", {
    xRealIp: Boolean(request.headers.get("x-real-ip")),
    xVercelFwd: Boolean(request.headers.get("x-vercel-forwarded-for")),
    xff: Boolean(request.headers.get("x-forwarded-for")),
    ipResolved: ip !== null,
  });
  if (ip) {
    const { success: rateLimitOk, reset } = await checkRateLimit(ip);
    if (!rateLimitOk) {
      const retryAfterSeconds = Math.max(Math.ceil((reset - Date.now()) / 1000), 1);
      return NextResponse.json(
        { error: "Забагато запитів. Спробуйте пізніше.", retryAfter: retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }
  } else {
    console.warn("[lead] rate_limit_skipped: клієнтський IP не визначено із заголовків");
  }

  // C12: одним запитом підтягуємо ключі всіх каналів доставки у кеш — далі
  // getIntegration бере з кешу (замість 6+ послідовних читань на кожен сабміт).
  await prefetchIntegrations([
    "telegram_bot_token",
    "telegram_chat_id",
    "keycrm_api_key",
    "smtp_user",
    "smtp_password",
    "smtp_from",
  ]);

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
  const ipForDb = ip; // string | null (getClientIp повертає null, якщо IP невідомий)

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
