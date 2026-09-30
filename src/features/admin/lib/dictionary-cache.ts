// features/admin/lib/dictionary-cache — клієнтський кеш довідників адмінки (стадії, відповідальні,
// реферальні посилання, кастомні поля). Ці списки потрібні на кількох екранах і рідко змінюються,
// а кожен запит до /api/admin/* — це перевірка ролі в БД + вибірка. Кеш живе в памʼяті вкладки:
// повернення з картки заявки до списку і перемикання розділів не перезапитують довідники.
//
// Свіжість: TTL 60 с; розділи, де довідники ЗМІНЮЮТЬСЯ («Налаштування», «Користувачі», «Реферальні
// посилання»), скидають кеш при вході й виході (useInvalidateDictionaries) — після правки стадій
// список заявок одразу бачить нові. Нових залежностей немає (SWR/React Query не використовуються).
import { useEffect } from 'react'

const TTL_MS = 60_000

type Entry = { at: number; promise: Promise<unknown> }
const cache = new Map<string, Entry>()

/**
 * JSON довідника за URL (GET). Паралельні виклики ділять один запит; помилка мережі або не-2xx
 * у кеш не потрапляє і повертає `fallback` (за замовчуванням `{ data: [] }`).
 */
export function fetchDictionary<T = { data?: unknown[] }>(url: string, fallback?: T): Promise<T> {
  const now = Date.now()
  const hit = cache.get(url)
  if (hit && now - hit.at < TTL_MS) return hit.promise as Promise<T>

  const promise = fetch(url)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return (await r.json()) as T
    })
    .catch(() => {
      if (cache.get(url)?.promise === promise) cache.delete(url)
      return (fallback ?? ({ data: [] } as unknown as T))
    })
  cache.set(url, { at: now, promise })
  return promise
}

/** Скидає кеш (усе або URL із заданим префіксом). */
export function invalidateDictionaries(prefix?: string): void {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
}

/** Для розділів, що змінюють довідники: скинути кеш при вході й при виході з розділу. */
export function useInvalidateDictionaries(): void {
  useEffect(() => {
    invalidateDictionaries()
    return () => invalidateDictionaries()
  }, [])
}
