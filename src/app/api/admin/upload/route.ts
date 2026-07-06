// POST /api/admin/upload — завантаження фото лікаря в Supabase Storage
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_content', 'manage_users']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Лише JPEG, PNG або WebP' }, { status: 400 })
  }

  const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Файл занадто великий (макс. 2 МБ)' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `${crypto.randomUUID()}.${ext}`

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('doctors-photos')
    .upload(filename, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[upload] storage_error', uploadError.message)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = service.storage
    .from('doctors-photos')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
