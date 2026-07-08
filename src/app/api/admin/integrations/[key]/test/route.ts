// POST /api/admin/integrations/[key]/test — тест з'єднання для конкретного ключа
// Читає значення з БД (розшифровує) і робить реальний API-запит
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/encryption'
import { hasAnyPermission } from '@/lib/permissions'
import { createGmailTransport } from '@/lib/integrations/email'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { key } = await params
  const service = createServiceClient()

  const { data, error } = await service
    .from('integrations')
    .select('encrypted_value, iv, auth_tag')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ ok: false, message: 'Ключ не знайдено в базі. Спочатку збережіть значення.' })
  }

  let value: string
  try {
    value = decrypt(data.encrypted_value, data.iv, data.auth_tag)
  } catch {
    return NextResponse.json({ ok: false, message: 'Помилка дешифрування. Перевірте ADMIN_ENCRYPTION_KEY.' })
  }

  // Тест Telegram Bot Token
  if (key === 'telegram_bot_token') {
    try {
      const res = await fetch(`https://api.telegram.org/bot${value}/getMe`, {
        signal: AbortSignal.timeout(5000),
      })
      const json = await res.json()
      if (json.ok) {
        return NextResponse.json({ ok: true, message: `Бот знайдено: @${json.result.username}` })
      }
      return NextResponse.json({ ok: false, message: `Telegram: ${json.description ?? 'Невірний токен'}` })
    } catch {
      return NextResponse.json({ ok: false, message: 'Не вдалось зʼєднатися з Telegram' })
    }
  }

  // Тест KeyCRM API Key
  if (key === 'keycrm_api_key') {
    try {
      const res = await fetch('https://openapi.keycrm.app/v1/pipeline', {
        headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        return NextResponse.json({ ok: true, message: 'KeyCRM: з\'єднання успішне ✓' })
      }
      return NextResponse.json({ ok: false, message: `KeyCRM: помилка ${res.status} — перевірте ключ` })
    } catch {
      return NextResponse.json({ ok: false, message: 'Не вдалось зʼєднатися з KeyCRM' })
    }
  }

  // Тест Gmail SMTP — перевіряємо зʼєднання і відправляємо реальний тестовий email.
  // value = App Password (ключ smtp_password). Gmail-адресу і From беремо з БД.
  if (key === 'smtp_password') {
    try {
      const readKey = async (k: string): Promise<string | null> => {
        const { data: row } = await service
          .from('integrations')
          .select('encrypted_value, iv, auth_tag')
          .eq('key', k)
          .maybeSingle()
        if (!row) return null
        try { return decrypt(row.encrypted_value, row.iv, row.auth_tag) } catch { return null }
      }

      const smtpUser = await readKey('smtp_user')
      if (!smtpUser) {
        return NextResponse.json({ ok: false, message: 'Спочатку збережіть Gmail-адресу (поле «Gmail-адреса»).' })
      }
      const fromEmail = (await readKey('smtp_from')) || smtpUser
      const toAddr = (process.env.NOTIFICATION_EMAIL ?? user.email ?? '').trim() || smtpUser

      const transport = createGmailTransport(smtpUser, value)
      await transport.verify()
      await transport.sendMail({
        from: fromEmail,
        to: toAddr,
        subject: 'Тест Gmail SMTP — VRK Partners',
        html: '<p>Інтеграція Gmail SMTP працює коректно ✓</p>',
      })

      return NextResponse.json({ ok: true, message: `Gmail SMTP: тестовий лист відправлено на ${toAddr}` })
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'помилка'
      // Часта причина — використали звичайний пароль замість App Password
      const hint = /invalid login|username and password|BadCredentials/i.test(raw)
        ? ' (перевірте: потрібен App Password, а не звичайний пароль; і увімкнена 2-етапна автентифікація)'
        : ''
      return NextResponse.json({ ok: false, message: `Gmail SMTP: ${raw}${hint}` })
    }
  }

  // Для інших ключів (turnstile, chat_id тощо) — просто підтверджуємо збереження
  return NextResponse.json({ ok: true, message: 'Значення збережено в базі ✓' })
}
