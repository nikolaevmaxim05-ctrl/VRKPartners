// Відправка повідомлення про новий лід в Telegram
// Формат: HTML-повідомлення з усіма полями заявки

import type { LeadFormData } from "@/lib/validators";
import { site } from "@/config/site";
import { hasUtm, utmEntries } from "@/lib/utm";
import { getIntegration } from "@/lib/integrations/get-integration";
import { getServiceLabel } from "@/lib/services";

type LeadData = Omit<LeadFormData, "turnstileToken" | "website" | "consent">;

interface IntegrationResult {
  ok: boolean;
  error?: string;
}

type SendOptions = {
  // Якщо true — повідомлення позначається як повторне звернення.
  // Використовується при дедуплікації: новий лід не створюється, але адміну
  // надсилається сповіщення з пометкой [ПОВТОР].
  isRepeat?: boolean;
};

export async function sendLeadToTelegram(
  data: LeadData,
  options: SendOptions = {}
): Promise<IntegrationResult> {
  // Читаємо з БД (з фолбеком на env). Паралельно — два запити до Supabase замість двох послідовних.
  const [botToken, chatId] = await Promise.all([
    getIntegration("telegram_bot_token"),
    getIntegration("telegram_chat_id"),
  ]);

  if (!botToken || !chatId) {
    console.warn("[telegram] bot_token or chat_id is not set (DB + env) — skipping");
    return { ok: false, error: "not configured" };
  }

  const serviceLabel = getServiceLabel(data.service);
  const now = new Date().toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // HTML-розмітка для Telegram parse_mode: HTML
  const header = options.isRepeat
    ? `<b>🔁 [ПОВТОР] Повторне звернення — ${escapeHtml(site.name)}</b>`
    : `<b>📥 Нова заявка — ${escapeHtml(site.name)}</b>`;

  const lines = [
    header,
    ``,
    `<b>Ім'я:</b> ${escapeHtml(data.name)}`,
    `<b>Телефон:</b> <code>${escapeHtml(data.phone)}</code>`,
    `<b>Послуга:</b> ${escapeHtml(serviceLabel)}`,
  ];

  if (data.comment) {
    lines.push(`<b>Коментар:</b> ${escapeHtml(data.comment)}`);
  }

  // Блок UTM — лише якщо є хоч одна мітка (без UTM не спамимо)
  if (hasUtm(data.utm)) {
    lines.push(``, `<b>📊 UTM:</b>`);
    for (const [label, value] of utmEntries(data.utm)) {
      lines.push(`• ${escapeHtml(label)}: ${escapeHtml(value)}`);
    }
  }

  lines.push(``, `<b>Час (Київ):</b> ${now}`);
  lines.push(
    `<b>Джерело:</b> ${data.source ? `<code>${escapeHtml(data.source)}</code>` : "Лендинг"}`
  );

  const text = lines.join("\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      // Логуємо без PII
      console.error("[telegram] sendMessage failed, status:", response.status, "body:", errText);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    console.log("[telegram] notification sent successfully");
    return { ok: true };
  } catch (err) {
    console.error("[telegram] fetch error:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "fetch error" };
  }
}

// Екранування HTML-спецсимволів для Telegram HTML mode
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
