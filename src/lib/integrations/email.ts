// Відправка email через Gmail SMTP (nodemailer).
// Лист адміністратору з усіма даними заявки.
//
// Налаштування (з БД integrations, з фолбеком на env):
//   smtp_user     — Gmail-адреса відправника (напр. team@gmail.com);
//   smtp_password — App Password Google (НЕ звичайний пароль акаунта!);
//   smtp_from     — відображуваний From (напр. "VRK Partners <team@gmail.com>"),
//                   якщо не задано — використовуємо smtp_user.
// NOTIFICATION_EMAIL — адресат (не секрет), тримаємо в env; фолбек — site.email.

import nodemailer from "nodemailer";
import type { LeadFormData } from "@/lib/validators";
import { getServiceLabel } from "@/lib/services";
import { site } from "@/config/site";
import { formatUtmSummary } from "@/lib/utm";
import { getIntegration } from "@/lib/integrations/get-integration";

type LeadData = Omit<LeadFormData, "website" | "consent">;

interface IntegrationResult {
  ok: boolean;
  error?: string;
}

/** Створює SMTP-транспорт Gmail. */
export function createGmailTransport(user: string, pass: string) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: { user, pass },
  });
}

export async function sendLeadEmail(data: LeadData): Promise<IntegrationResult> {
  const [smtpUser, smtpPassword, smtpFrom] = await Promise.all([
    getIntegration("smtp_user"),
    getIntegration("smtp_password"),
    getIntegration("smtp_from"),
  ]);
  const toEmail = process.env.NOTIFICATION_EMAIL ?? site.email;

  if (!smtpUser || !smtpPassword) {
    console.warn("[email] smtp_user/smtp_password не задані (БД + env) — пропускаємо");
    return { ok: false, error: "not configured" };
  }

  const fromEmail = smtpFrom || smtpUser;
  const serviceLabel = getServiceLabel(data.service);

  try {
    const transport = createGmailTransport(smtpUser, smtpPassword);
    await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: `Нова заявка з сайту — ${data.name}`,
      html: buildAdminEmailHtml(data, serviceLabel),
    });

    console.log("[email] admin notification sent successfully (Gmail SMTP)");
    return { ok: true };
  } catch (err) {
    console.error("[email] send error:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: err instanceof Error ? err.message : "send error" };
  }
}

// HTML-шаблон листа адміністратору (українською)
function buildAdminEmailHtml(data: LeadData, serviceLabel: string): string {
  const now = new Date().toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const utmSummary = formatUtmSummary(data.utm);

  const rows = [
    ["Ім'я", escapeHtml(data.name)],
    ["Телефон", escapeHtml(data.phone)],
    ["Послуга", escapeHtml(serviceLabel)],
    ...(data.comment ? [["Коментар", escapeHtml(data.comment)]] : []),
    [
      "Джерело",
      utmSummary ? escapeHtml(utmSummary) : "Лендінг vrkpartners.com",
    ],
    ...(data.utm?.referrer ? [["Referrer", escapeHtml(data.utm.referrer)]] : []),
    ...(data.utm?.gclid ? [["gclid", escapeHtml(data.utm.gclid)]] : []),
    ...(data.utm?.fbclid ? [["fbclid", escapeHtml(data.utm.fbclid)]] : []),
    ...(data.utm?.ttclid ? [["ttclid", escapeHtml(data.utm.ttclid)]] : []),
    ...(data.source ? [["Сторінка входу", escapeHtml(data.source)]] : []),
    ["Час подачі (Київ)", now],
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 12px;background:#f9fafb;font-weight:600;color:#374151;border:1px solid #e5e7eb;white-space:nowrap;">${label}</td>
      <td style="padding:8px 12px;color:#111827;border:1px solid #e5e7eb;">${value}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Нова заявка — ${escapeHtml(site.name)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                📥 Нова заявка з сайту
              </h1>
              <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">${escapeHtml(site.name)}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;color:#374151;font-size:16px;">
                Нова заявка з лендингу. Радимо звʼязатися з клієнтом якнайшвидше —
                бажано протягом <strong>15 хвилин</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
                ${tableRows}
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;">
                Це автоматичне повідомлення з лендингу.
                Будь ласка, не відповідайте на цей лист.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} ${escapeHtml(site.name)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Експортуємо для тестів
export { buildAdminEmailHtml };
