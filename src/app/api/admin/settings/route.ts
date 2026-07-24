// GET  /api/admin/settings — повертає всі ключі site_settings одним об'єктом
// PUT  /api/admin/settings — приймає масив items: [{key, value, type?}] для оновлення
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

// Білий список ключів — захист від запису довільних налаштувань через API
const ALLOWED_KEYS = new Set<string>([
  'internal_currency',
  'dedup_by_phone',
  'dedup_by_ip',
  'dedup_ip_window_hours',
  // S6: telephony_secret більше НЕ зберігається у site_settings (plaintext) —
  // він переїхав у integrations (AES-256-GCM). Тут його не приймаємо і не віддаємо.
  'google_ads_conversion_action',
  'deal_amount_type',
  'pipelines_enabled',
])

// S6: ніколи не віддаємо секрети з GET settings (навіть якщо колись зʼявляться).
const SECRET_KEYS = new Set<string>(['telephony_secret'])

const ALLOWED_CURRENCIES = ['UAH', 'USD', 'EUR']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value, type, updated_at')

  if (error) {
    console.error('[admin/settings] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // S6: секрети ніколи не повертаємо через цей GET.
  const safe = (data ?? []).filter((r) => !SECRET_KEYS.has(r.key))
  return NextResponse.json({ data: safe })
}

type PutItem = { key: string; value: string | number | boolean | null; type?: string }
type PutBody = { items: PutItem[] }

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PutBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Порожній items' }, { status: 400 })
  }

  // Валідуємо й нормалізуємо. Зберігаємо як TEXT (стовпець value — text).
  const rows: { key: string; value: string; type: string; updated_at: string; updated_by: string }[] = []
  const now = new Date().toISOString()

  for (const item of body.items) {
    if (!ALLOWED_KEYS.has(item.key)) {
      return NextResponse.json({ error: `Невідомий ключ: ${item.key}` }, { status: 400 })
    }
    const type = item.type ?? inferType(item.key)
    let value: string

    if (type === 'boolean') {
      value = item.value === true || item.value === 'true' ? 'true' : 'false'
    } else if (type === 'number') {
      const n = Number(item.value)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `Невірне число для ${item.key}` }, { status: 400 })
      }
      value = String(Math.floor(n))
    } else {
      value = item.value == null ? '' : String(item.value).trim()
      if (item.key === 'internal_currency' && !ALLOWED_CURRENCIES.includes(value)) {
        return NextResponse.json({ error: 'Валюта: UAH, USD або EUR' }, { status: 400 })
      }
      if (item.key === 'deal_amount_type' && !['amount', 'profit'].includes(value)) {
        return NextResponse.json({ error: 'deal_amount_type: amount або profit' }, { status: 400 })
      }
    }

    rows.push({ key: item.key, value, type, updated_at: now, updated_by: user.id })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('site_settings')
    .upsert(rows, { onConflict: 'key' })

  if (error) {
    console.error('[admin/settings] upsert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// Default-type за ключем — використовується, якщо клієнт не передав type
function inferType(key: string): string {
  if (key === 'dedup_by_phone' || key === 'dedup_by_ip') return 'boolean'
  if (key === 'pipelines_enabled') return 'boolean'
  if (key === 'dedup_ip_window_hours') return 'number'
  return 'string'
}
