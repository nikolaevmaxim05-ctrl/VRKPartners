// core/domain/content/landing — правила URL для контента лендинга (картинки next/image,
// href кейсов — защита от javascript:, кнопка Telegram). Модель текстов — site-messages.ts,
// мерж/дифф — messages.ts, лимиты — limits.ts (Фаза 3, раздел 9 стандарта).

/** Безопасный URL изображения: пусто, локальный путь `/...` или https на разрешённом хосте. */
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

/** Безопасная ссылка: пусто или абсолютный http(s). Блокирует javascript:/data: и т. д. */
export function isSafeHref(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Кнопка «Або напишіть нам»: только https://t.me/… или https://telegram.me/…; пустое — валидно. */
export function isTelegramUrl(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 't.me' || u.hostname === 'telegram.me')
  } catch {
    return false
  }
}
