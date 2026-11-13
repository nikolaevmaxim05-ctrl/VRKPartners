// core/domain/analytics/format — даты в часовом поясе клиента для выгрузок.
export const CLIENT_TIME_ZONE = 'Europe/Kyiv'

export function formatKyivDateTime(isoUtc: string): string {
  const d = new Date(isoUtc)
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: CLIENT_TIME_ZONE,
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(d).replace(',', '')
}

export function formatKyivDate(isoUtc: string): string {
  const d = new Date(isoUtc)
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: CLIENT_TIME_ZONE,
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  }).format(d)
}

/** Подпись диапазона «dd.mm.yyyy – dd.mm.yyyy». */
export function periodLabel(dateFrom: string, dateTo: string): string {
  return `${formatKyivDate(dateFrom + 'T12:00:00Z')} – ${formatKyivDate(dateTo + 'T12:00:00Z')}`
}
