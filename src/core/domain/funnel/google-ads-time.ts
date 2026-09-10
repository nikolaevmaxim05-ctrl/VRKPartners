// core/domain/funnel/google-ads-time — формат часу Google Ads з явним зміщенням
// часового поясу клієнта: "2024-01-15 10:30:00+03:00" (Europe/Kyiv). Чиста функція.

export const CLIENT_TIME_ZONE = 'Europe/Kyiv'

export function toGoogleAdsTime(iso: string): string {
  const d = new Date(iso)
  const offsetParts = new Intl.DateTimeFormat('en', {
    timeZone: CLIENT_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(d)
  const rawOffset = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const tzOffset = rawOffset.replace('GMT', '') // "+03:00"

  const parts = new Intl.DateTimeFormat('en', {
    timeZone: CLIENT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}${tzOffset}`
}
