// infrastructure/integrations/format — общие мелочи сообщений (Telegram/email).

/** Экранирование HTML-спецсимволов (Telegram HTML mode, email). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Текущее время в Киеве: "dd.mm.yyyy, hh:mm". */
export function kyivNow(): string {
  return new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
