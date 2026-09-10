// infrastructure/integrations/format — спільні дрібниці повідомлень (Telegram/email).

/** Екранування HTML-спецсимволів (Telegram HTML mode, email). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Поточний час у Києві: "dd.mm.yyyy, hh:mm". */
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
