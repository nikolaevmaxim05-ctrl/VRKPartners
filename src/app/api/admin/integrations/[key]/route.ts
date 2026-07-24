// PUT    /api/admin/integrations/[key] — зберегти/оновити ключ (зашифрувати)
// DELETE /api/admin/integrations/[key] — видалити ключ
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { encrypt } from '@/lib/encryption'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

const INTEGRATION_PERMS = ['manage_settings', 'manage_integrations'] as const

// S9: key приходить з URL — приймаємо лише відомі інтеграції, щоб не засмічувати
// таблицю integrations довільними ключами (і не ловити «примарні» секрети).
const KNOWN_INTEGRATION_KEYS = new Set<string>([
  'telegram_bot_token',
  'telegram_chat_id',
  'keycrm_api_key',
  'smtp_user',
  'smtp_password',
  'smtp_from',
  'google_sheets_service_account_json',
  'google_spreadsheet_id',
  'google_adjustments_spreadsheet_id',
  'telephony_secret',
])

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, [...INTEGRATION_PERMS]))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { key } = await params
  if (!KNOWN_INTEGRATION_KEYS.has(key)) {
    return NextResponse.json({ error: 'Невідома інтеграція' }, { status: 400 })
  }
  let body: { value: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.value?.trim()) {
    return NextResponse.json({ error: 'Value is required' }, { status: 400 })
  }

  const { encrypted_value, iv, auth_tag } = encrypt(body.value.trim())
  const service = createServiceClient()

  const { error } = await service.from('integrations').upsert({
    key,
    encrypted_value,
    iv,
    auth_tag,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, [...INTEGRATION_PERMS]))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { key } = await params
  if (!KNOWN_INTEGRATION_KEYS.has(key)) {
    return NextResponse.json({ error: 'Невідома інтеграція' }, { status: 400 })
  }
  const service = createServiceClient()
  const { error } = await service.from('integrations').delete().eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
