// PATCH /api/admin/conversions/[id] удалён.
// offline_conversions является read-only срезом — редактирование через API запрещено.
// Исправления делаются через отдельную таблицу conversion_corrections (TBD).
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function PATCH() {
  return NextResponse.json(
    { error: 'Метод не підтримується. Записи конверсій є read-only.' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
