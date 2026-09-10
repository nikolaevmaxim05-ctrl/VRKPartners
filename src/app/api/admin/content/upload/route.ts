// POST /api/admin/content/upload — картинка контенту у Supabase Storage (bucket `content`).
// multipart: file, previous (URL файлу, який замінюється — видаляється, якщо наш).
import { NextRequest, NextResponse } from 'next/server'
import { getContentUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const POST = (request: NextRequest) =>
  withAdmin(['manage_content'], async () => {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Очікується multipart/form-data' }, { status: 400 })
    }
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не передано' }, { status: 400 })

    const previous = form.get('previous')
    const result = await getContentUseCases().uploadImage(
      { type: file.type, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) },
      typeof previous === 'string' && previous ? previous : null,
    )
    return respond(result, ({ url }) => ({ ok: true, url }))
  })
