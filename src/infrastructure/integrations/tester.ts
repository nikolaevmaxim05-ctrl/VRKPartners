// infrastructure/integrations/tester — «Перевірити підключення» (Telegram, KeyCRM, Gmail SMTP).
import type { IntegrationTester } from '@core/application/ports/notifications'
import { createGmailTransport } from './email'

export function makeIntegrationTester(deps: { siteName: string }): IntegrationTester {
  return {
    async telegram(botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(5000) })
        const json = await res.json()
        if (json.ok) return { ok: true, message: `Бот знайдено: @${json.result.username}` }
        return { ok: false, message: `Telegram: ${json.description ?? 'Невірний токен'}` }
      } catch {
        return { ok: false, message: 'Не вдалось зʼєднатися з Telegram' }
      }
    },

    async keycrm(apiKey) {
      try {
        const res = await fetch('https://openapi.keycrm.app/v1/pipeline', {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) return { ok: true, message: 'KeyCRM: з\'єднання успішне ✓' }
        return { ok: false, message: `KeyCRM: помилка ${res.status} — перевірте ключ` }
      } catch {
        return { ok: false, message: 'Не вдалось зʼєднатися з KeyCRM' }
      }
    },

    async smtp({ user, password, from, to }) {
      try {
        const transport = await createGmailTransport(user, password)
        await transport.verify()
        await transport.sendMail({
          from,
          to,
          subject: `Тест Gmail SMTP — ${deps.siteName}`,
          html: '<p>Інтеграція Gmail SMTP працює коректно ✓</p>',
        })
        return { ok: true, message: `Gmail SMTP: тестовий лист відправлено на ${to}` }
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'помилка'
        // Частая причина — обычный пароль вместо App Password
        const hint = /invalid login|username and password|BadCredentials/i.test(raw)
          ? ' (перевірте: потрібен App Password, а не звичайний пароль; і увімкнена 2-етапна автентифікація)'
          : ''
        return { ok: false, message: `Gmail SMTP: ${raw}${hint}` }
      }
    },
  }
}
