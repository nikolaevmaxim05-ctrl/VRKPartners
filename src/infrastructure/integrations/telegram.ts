// infrastructure/integrations/telegram — сповіщення про заявку в Telegram (HTML parse_mode).
import type { IntegrationConfig } from '@core/application/ports/settings'
import type { LeadNotifier } from '@core/application/ports/notifications'
import { hasUtm, utmEntries } from '@core/domain/lead/utm'
import { describeReferral } from '@core/domain/referral/link-rules'
import { getServiceLabel } from '@core/domain/lead/services'
import { escapeHtml, kyivNow } from './format'

export function makeTelegramNotifier(deps: { config: IntegrationConfig; siteName: string }): LeadNotifier {
  return {
    async send(data, options = {}) {
      const [botToken, chatId] = await Promise.all([
        deps.config.get('telegram_bot_token'),
        deps.config.get('telegram_chat_id'),
      ])
      if (!botToken || !chatId) {
        console.warn('[telegram] bot_token or chat_id is not set (DB + env) — skipping')
        return { ok: false, error: 'not configured' }
      }

      const header = options.isRepeat
        ? `<b>🔁 [ПОВТОР] Повторне звернення — ${escapeHtml(deps.siteName)}</b>`
        : `<b>📥 Нова заявка — ${escapeHtml(deps.siteName)}</b>`

      const lines = [
        header,
        ``,
        `<b>Ім'я:</b> ${escapeHtml(data.name)}`,
        `<b>Телефон:</b> <code>${escapeHtml(data.phone)}</code>`,
        `<b>Послуга:</b> ${escapeHtml(getServiceLabel(data.service))}`,
      ]
      if (data.comment) lines.push(`<b>Коментар:</b> ${escapeHtml(data.comment)}`)
      if (data.referral) lines.push(`<b>🤝 ${escapeHtml(describeReferral(data.referral))}</b>`)
      if (hasUtm(data.utm)) {
        lines.push(``, `<b>📊 UTM:</b>`)
        for (const [label, value] of utmEntries(data.utm)) lines.push(`• ${escapeHtml(label)}: ${escapeHtml(value)}`)
      }
      lines.push(``, `<b>Час (Київ):</b> ${kyivNow()}`)
      lines.push(`<b>Джерело:</b> ${data.source ? `<code>${escapeHtml(data.source)}</code>` : 'Лендинг'}`)

      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
        })
        if (!response.ok) {
          const errText = await response.text()
          console.error('[telegram] sendMessage failed, status:', response.status, 'body:', errText)
          return { ok: false, error: `HTTP ${response.status}` }
        }
        console.log('[telegram] notification sent successfully')
        return { ok: true }
      } catch (err) {
        console.error('[telegram] fetch error:', err instanceof Error ? err.message : String(err))
        return { ok: false, error: 'fetch error' }
      }
    },
  }
}
