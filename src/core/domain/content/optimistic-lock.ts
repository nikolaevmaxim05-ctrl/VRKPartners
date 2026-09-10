// Спільна перевірка optimistic-lock для редакторів адмінки (site_content:
// контент/legal/SEO). Форма надсилає updated_at, отриманий при завантаженні;
// сервер порівнює його з поточним у БД, щоб не «загубити» правки іншого адміна.
//
// ВАЖЛИВО: порівнюємо за МОМЕНТОМ ЧАСУ (getTime), а не за рядком. Причина бага:
// сервер пише updated_at як JS-ISO (`2026-...T12:34:56.789Z`), а supabase-js читає
// той самий timestamptz у форматі PostgREST (`2026-...T12:34:56.789+00:00`). Рядки
// різні → рядкове порівняння давало ХИБНИЙ 409 навіть при збереженні власних змін
// (друге й наступні збереження без F5 завжди падали). За моментом часу формат
// не має значення.

/**
 * true → дані застаріли (інший запис перезаписав рядок між завантаженням і збереженням) → 409.
 * false → конфлікту немає (перший запис, немає токена, або той самий момент у різних форматах).
 */
export function isStaleUpdate(
  storedUpdatedAt: string | null | undefined,
  clientBaseUpdatedAt: string | null | undefined,
): boolean {
  // Немає рядка в БД (перший запис) або клієнт не надіслав токен — перевіряти нічого.
  if (!storedUpdatedAt || typeof clientBaseUpdatedAt !== 'string') return false

  const stored = new Date(storedUpdatedAt).getTime()
  const client = new Date(clientBaseUpdatedAt).getTime()

  // Невалідні дати — не блокуємо (fail-open, як і при відсутності токена).
  if (Number.isNaN(stored) || Number.isNaN(client)) return false

  return stored !== client
}
