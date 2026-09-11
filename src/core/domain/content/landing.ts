// core/domain/content/landing — правила URL для контенту лендингу (картинки next/image,
// href кейсів — захист від javascript:, кнопка Telegram). Модель текстів — site-messages.ts,
// мерж/дифф — messages.ts, ліміти — limits.ts (Фаза 3, розділ 9 стандарту).

/** Безпечний URL зображення: порожньо, локальний шлях `/...`, або https на дозволеному хості. */
export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return true
  if (url.startsWith('/')) return !url.startsWith('//')
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co'))
  } catch {
    return false
  }
}

/** Безпечне посилання: порожньо або абсолютний http(s). Блокує javascript:/data: тощо. */
export function isSafeHref(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Кнопка «Або напишіть нам»: лише https://t.me/… або https://telegram.me/…; порожнє — валідне. */
export function isTelegramUrl(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 't.me' || u.hostname === 'telegram.me')
  } catch {
    return false
  }
}
