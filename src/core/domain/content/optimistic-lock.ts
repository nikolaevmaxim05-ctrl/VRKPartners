// Общая проверка optimistic-lock для редакторов админки (site_content:
// контент/legal/SEO). Форма отправляет updated_at, полученный при загрузке;
// сервер сравнивает его с текущим в БД, чтобы не «потерять» правки другого админа.
//
// ВАЖНО: сравниваем по МОМЕНТУ ВРЕМЕНИ (getTime), а не по строке. Причина бага:
// сервер пишет updated_at как JS-ISO (`2026-...T12:34:56.789Z`), а supabase-js читает
// тот же timestamptz в формате PostgREST (`2026-...T12:34:56.789+00:00`). Строки
// разные → строковое сравнение давало ЛОЖНЫЙ 409 даже при сохранении собственных изменений
// (второе и последующие сохранения без F5 всегда падали). По моменту времени формат
// не имеет значения.

/**
 * true → данные устарели (другая запись перезаписала строку между загрузкой и сохранением) → 409.
 * false → конфликта нет (первая запись, нет токена или тот же момент в разных форматах).
 */
export function isStaleUpdate(
  storedUpdatedAt: string | null | undefined,
  clientBaseUpdatedAt: string | null | undefined,
): boolean {
  // Нет строки в БД (первая запись) или клиент не отправил токен — проверять нечего.
  if (!storedUpdatedAt || typeof clientBaseUpdatedAt !== 'string') return false

  const stored = new Date(storedUpdatedAt).getTime()
  const client = new Date(clientBaseUpdatedAt).getTime()

  // Невалидные даты — не блокируем (fail-open, как и при отсутствии токена).
  if (Number.isNaN(stored) || Number.isNaN(client)) return false

  return stored !== client
}
