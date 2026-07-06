// PATCH /api/admin/conversions/[id] видалений.
// offline_conversions є read-only зрізом — редагування заборонено через API.
// Виправлення робляться через окрему таблицю conversion_corrections (TBD).
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function PATCH() {
  return NextResponse.json(
    { error: 'Метод не підтримується. Записи конверсій є read-only.' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
