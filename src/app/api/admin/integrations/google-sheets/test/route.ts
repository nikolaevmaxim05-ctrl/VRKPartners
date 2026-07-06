// POST /api/admin/integrations/google-sheets/test
// Перевірка зʼєднання з Google Sheets: тестує ОБИДВІ таблиці — основну
// (офлайн-конверсій) і таблицю корекцій. Для кожної витягує назву через
// Sheets API (доступ service account) і — якщо доступ є — best-effort форматує
// потрібні колонки як TEXT. Помилка доступу до таблиці корекцій НЕ валить
// перевірку основної (повертається окремим per-table результатом).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureTextColumns, getSheetTitle, getAdjustmentsSheetTitle } from '@/lib/google-sheets'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  // ── Основна таблиця офлайн-конверсій ──────────────────────────────────────
  const main = await getSheetTitle()
  if (!main.ok) {
    // ok=false: основна таблиця недоступна — корекції не перевіряємо.
    return NextResponse.json({ ok: false, main: { ok: false, message: main.message } })
  }
  // Best-effort форматування колонок phone_number (C) і event_time (G) як TEXT.
  const mainFormatted = await ensureTextColumns(main.accessToken, main.spreadsheetId, [2, 6])

  // ── Таблиця корекцій (окрема, той самий service account) ──────────────────
  const adj = await getAdjustmentsSheetTitle()
  let adjustments:
    | { status: 'ok'; title: string; formatted: boolean }
    | { status: 'not_configured' }
    | { status: 'error'; message: string }
  if (adj.status === 'ok') {
    // Колонка Adjustment Time (index 2) як TEXT.
    const adjFormatted = await ensureTextColumns(adj.accessToken, adj.spreadsheetId, [2])
    adjustments = { status: 'ok', title: adj.title, formatted: adjFormatted }
  } else if (adj.status === 'not_configured') {
    adjustments = { status: 'not_configured' }
  } else {
    adjustments = { status: 'error', message: adj.message }
  }

  return NextResponse.json({
    ok: true,
    main: { ok: true, title: main.title, formatted: mainFormatted },
    adjustments,
  })
}
