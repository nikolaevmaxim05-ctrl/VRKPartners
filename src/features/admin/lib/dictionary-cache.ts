// features/admin/lib/dictionary-cache — клиентский кэш справочников админки (стадии, ответственные,
// реферальные ссылки, кастомные поля). Эти списки нужны на нескольких экранах и редко меняются,
// а каждый запрос к /api/admin/* — это проверка роли в БД + выборка. Кэш живёт в памяти вкладки:
// возврат из карточки заявки к списку и переключение разделов не перезапрашивают справочники.
//
// Свежесть: TTL 60 с; разделы, где справочники МЕНЯЮТСЯ («Налаштування», «Користувачі», «Реферальні
// посилання»), сбрасывают кэш при входе и выходе (useInvalidateDictionaries) — после правки стадий
// список заявок сразу видит новые. Новых зависимостей нет (SWR/React Query не используются).
import { useEffect } from 'react'

const TTL_MS = 60_000

type Entry = { at: number; promise: Promise<unknown> }
const cache = new Map<string, Entry>()

/**
 * JSON справочника по URL (GET). Параллельные вызовы делят один запрос; ошибка сети или не-2xx
 * в кэш не попадает и возвращает `fallback` (по умолчанию `{ data: [] }`).
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

/** Сбрасывает кэш (весь или URL с заданным префиксом). */
export function invalidateDictionaries(prefix?: string): void {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
}

/** Для разделов, которые меняют справочники: сбросить кэш при входе и при выходе из раздела. */
export function useInvalidateDictionaries(): void {
  useEffect(() => {
    invalidateDictionaries()
    return () => invalidateDictionaries()
  }, [])
}
