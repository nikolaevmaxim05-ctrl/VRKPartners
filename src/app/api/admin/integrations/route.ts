// GET /api/admin/integrations — список всіх ключів зі статусом і замаскованим значенням
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt, maskValue } from '@/lib/encryption'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

// Несекретні ключі — Spreadsheet ID не є секретом, віддаємо plaintext для prefill.
// Усі інші (SA JSON, telegram/keycrm/resend/turnstile тощо) — masked-only.
const PLAINTEXT_KEYS = new Set([
  'google_spreadsheet_id',
  'google_adjustments_spreadsheet_id',
  // Gmail SMTP: адреса й From — не секрети, віддаємо для prefill (пароль лишається masked)
  'smtp_user',
  'smtp_from',
])

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('integrations')
    .select('key, encrypted_value, iv, auth_tag, updated_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map(row => {
    let masked_value: string | null = null
    let value: string | null = null
    try {
      const plain = decrypt(row.encrypted_value, row.iv, row.auth_tag)
      masked_value = maskValue(plain)
      if (PLAINTEXT_KEYS.has(row.key)) value = plain
    } catch {}
    return {
      key: row.key,
      is_set: true,
      masked_value,
      value,
      updated_at: row.updated_at,
    }
  })

  return NextResponse.json({ data: result })
}
