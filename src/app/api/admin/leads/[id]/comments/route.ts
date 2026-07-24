// GET  /api/admin/leads/[id]/comments?type=comment|note|system — стрічка коментарів
// POST /api/admin/leads/[id]/comments — додати comment або note (type=system пишеться лише з PATCH /leads/[id])
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAccess } from '@/lib/api-guard'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const ALLOWED_TYPES = ['comment', 'note', 'system'] as const
type CommentType = (typeof ALLOWED_TYPES)[number]

// Коментарі лежать поруч з PII ліда — той самий клас доступу, що і список/деталь.
const VIEW_PERMS = ['manage_leads', 'view_reports', 'export_data', 'manage_conversions'] as const

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const guard = await requireApiAccess([...VIEW_PERMS])
  if (!guard.ok) return guard.response

  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const typeFilter = searchParams.get('type')

  let query = supabase
    .from('lead_comments')
    .select('id, lead_id, user_id, user_email, type, content, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  if (typeFilter && (ALLOWED_TYPES as readonly string[]).includes(typeFilter)) {
    query = query.eq('type', typeFilter)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin/leads/[id]/comments] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  // Додавання коментаря — право manage_leads (+ активний користувач).
  const guard = await requireApiAccess(['manage_leads'])
  if (!guard.ok) return guard.response

  let body: { type?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = (body.type ?? 'comment') as CommentType
  const content = (body.content ?? '').trim()

  if (!ALLOWED_TYPES.includes(type) || type === 'system') {
    // system пишеться лише сервером з PATCH /leads/[id]
    return NextResponse.json({ error: 'Невалідний тип' }, { status: 400 })
  }
  if (!content) {
    return NextResponse.json({ error: 'Порожній коментар' }, { status: 400 })
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: 'Занадто довгий коментар' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('lead_comments')
    .insert({
      lead_id: id,
      user_id: guard.userId,
      user_email: guard.email,
      type,
      content,
    })
    .select('id, lead_id, user_id, user_email, type, content, created_at')
    .single()

  if (error) {
    console.error('[admin/leads/[id]/comments] insert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
