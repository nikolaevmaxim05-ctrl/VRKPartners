// POST /api/admin/content/upload — завантаження кастомного зображення у Supabase Storage
// Повертає публічний URL, який зберігається як шлях зображення в контенті.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

const BUCKET = 'content'
const MAX_BYTES = 5 * 1024 * 1024
// SVG навмисно виключено: next/image не оптимізує віддалені SVG (буде зламане зображення на лендингу).
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_content']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Очікується multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не передано' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Дозволені лише зображення: png, jpg, webp, gif' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Максимальний розмір — 5 МБ' }, { status: 400 })
  }

  const extFromType: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  }
  const ext = extFromType[file.type] ?? 'bin'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const service = createServiceClient()

  const { error } = await service.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    // Логуємо РЕАЛЬНУ причину (напр. «Bucket not found» — типово після переїзду
    // на новий Supabase-проєкт, поки bucket не створено міграцією 027).
    console.error('[content-upload] upload_failed', {
      bucket: BUCKET,
      name: error.name,
      message: error.message,
    })
    return NextResponse.json({ error: 'Не вдалося завантажити файл' }, { status: 500 })
  }

  // C14: видаляємо попередній файл при заміні (щоб не плодити сиріт у bucket).
  // Клієнт передає старий URL у полі `previous`; чіпаємо лише обʼєкти НАШОГО bucket.
  const previous = form.get('previous')
  if (typeof previous === 'string' && previous) {
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const idx = previous.indexOf(marker)
    if (idx !== -1) {
      const oldPath = previous.slice(idx + marker.length)
      if (oldPath && oldPath !== path) {
        try {
          await service.storage.from(BUCKET).remove([oldPath])
        } catch (e) {
          console.error('[content/upload] old_file_remove_failed', e)
        }
      }
    }
  }

  const { data } = service.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ ok: true, url: data.publicUrl })
}
