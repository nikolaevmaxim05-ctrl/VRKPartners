// infrastructure/integrations/email — письмо администратору о заявке через Gmail SMTP (nodemailer).
// smtp_user / smtp_password (App Password) / smtp_from — БД→env; адресат — NOTIFICATION_EMAIL.
import type { IntegrationConfig } from '@core/application/ports/settings'
import type { LeadNotifier, LeadNotification } from '@core/application/ports/notifications'
import { formatUtmSummary } from '@core/domain/lead/utm'
import { describeReferral } from '@core/domain/referral/link-rules'
import { getServiceLabel } from '@core/domain/lead/services'
import { escapeHtml, kyivNow } from './format'

/** SMTP-транспорт Gmail. nodemailer загружается только во время отправки (динамический import — не в общем чанке). */
export async function createGmailTransport(user: string, pass: string) {
  const nodemailer = (await import('nodemailer')).default
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
}

export function makeEmailNotifier(deps: {
  config: IntegrationConfig
  siteName: string
  /** Адресат (читается в момент вызова): NOTIFICATION_EMAIL → email сайта. */
  notificationEmail: () => string
}): LeadNotifier {
  return {
    async send(data) {
      const [smtpUser, smtpPassword, smtpFrom] = await Promise.all([
        deps.config.get('smtp_user'),
        deps.config.get('smtp_password'),
        deps.config.get('smtp_from'),
      ])
      if (!smtpUser || !smtpPassword) {
        console.warn('[email] smtp_user/smtp_password не задані (БД + env) — пропускаємо')
        return { ok: false, error: 'not configured' }
      }
      try {
        await (await createGmailTransport(smtpUser, smtpPassword)).sendMail({
          from: smtpFrom || smtpUser,
          to: deps.notificationEmail(),
          subject: `Нова заявка з сайту — ${data.name}`,
          html: buildAdminEmailHtml(data, getServiceLabel(data.service), deps.siteName),
        })
        console.log('[email] admin notification sent successfully (Gmail SMTP)')
        return { ok: true }
      } catch (err) {
        console.error('[email] send error:', err instanceof Error ? err.message : String(err))
        return { ok: false, error: err instanceof Error ? err.message : 'send error' }
      }
    },
  }
}

/** HTML-шаблон письма администратору (uk-UA). */
export function buildAdminEmailHtml(data: LeadNotification, serviceLabel: string, siteName: string): string {
  const utmSummary = formatUtmSummary(data.utm)
  const rows = [
    ["Ім'я", escapeHtml(data.name)],
    ['Телефон', escapeHtml(data.phone)],
    ['Послуга', escapeHtml(serviceLabel)],
    ...(data.comment ? [['Коментар', escapeHtml(data.comment)]] : []),
    ...(data.referral ? [['Партнер', escapeHtml(describeReferral(data.referral))]] : []),
    ['Джерело', utmSummary ? escapeHtml(utmSummary) : 'Лендінг vrkpartners.com'],
    ...(data.utm?.referrer ? [['Referrer', escapeHtml(data.utm.referrer)]] : []),
    ...(data.utm?.gclid ? [['gclid', escapeHtml(data.utm.gclid)]] : []),
    ...(data.utm?.fbclid ? [['fbclid', escapeHtml(data.utm.fbclid)]] : []),
    ...(data.utm?.ttclid ? [['ttclid', escapeHtml(data.utm.ttclid)]] : []),
    ...(data.source ? [['Сторінка входу', escapeHtml(data.source)]] : []),
    ['Час подачі (Київ)', kyivNow()],
  ]

  const tableRows = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 12px;background:#f9fafb;font-weight:600;color:#374151;border:1px solid #e5e7eb;white-space:nowrap;">${label}</td>
      <td style="padding:8px 12px;color:#111827;border:1px solid #e5e7eb;">${value}</td>
    </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Нова заявка — ${escapeHtml(siteName)}</title>
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
              <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">${escapeHtml(siteName)}</p>
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
                © ${new Date().getFullYear()} ${escapeHtml(siteName)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
