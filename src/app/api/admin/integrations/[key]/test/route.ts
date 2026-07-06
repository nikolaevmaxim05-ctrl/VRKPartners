// POST /api/admin/integrations/[key]/test — тест з'єднання для конкретного ключа
// Читає значення з БД (розшифровує) і робить реальний API-запит
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/encryption'
import { hasAnyPermission } from '@/lib/permissions'

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

  // Тест Resend API Key — відправляємо реальний тестовий email
  if (key === 'resend_api_key') {
    try {
      // Читаємо From-адресу з БД (або дефолт)
      const { data: fromRow } = await service
        .from('integrations')
        .select('encrypted_value, iv, auth_tag')
        .eq('key', 'resend_from')
        .maybeSingle()

      let fromEmail = 'onboarding@resend.dev'
      if (fromRow) {
        try { fromEmail = decrypt(fromRow.encrypted_value, fromRow.iv, fromRow.auth_tag) } catch {}
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [(process.env.NOTIFICATION_EMAIL ?? user.email ?? '').trim() || 'noreply@resend.dev'],
          subject: 'Тест Resend — VRK Partners',
          html: '<p>Інтеграція Resend працює коректно ✓</p>',
        }),
        signal: AbortSignal.timeout(8000),
      })

      const toAddr = (process.env.NOTIFICATION_EMAIL ?? user.email ?? '').trim() || 'noreply@resend.dev'
      if (res.ok) {
        return NextResponse.json({ ok: true, message: `Resend: тестовий лист відправлено на ${toAddr}` })
      }
      const errJson = await res.json().catch(() => ({}))
      const errMsg = errJson?.message ?? res.status
      return NextResponse.json({ ok: false, message: `Resend: помилка — ${errMsg}` })
    } catch {
      return NextResponse.json({ ok: false, message: 'Не вдалось зʼєднатися з Resend' })
    }
  }

  // Для інших ключів (turnstile, chat_id тощо) — просто підтверджуємо збереження
  return NextResponse.json({ ok: true, message: 'Значення збережено в базі ✓' })
}
