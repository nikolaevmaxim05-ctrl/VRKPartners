// presentation/client-ip — клієнтський IP для rate-limit / dedup (ланцюжок розділу 8):
//   cf-connecting-ip → перший сегмент x-forwarded-for → x-real-ip → 'unknown'.
// На Vercel x-forwarded-for виставляє платформа (клієнтський спуфінг неможливий).
// 'unknown' — сценарій пропускає ліміт і дедуп за IP, у БД пише NULL (відхилення 10).
export const UNKNOWN_IP = 'unknown'

export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return UNKNOWN_IP
}

/** Лог без сирого IP (PII) — щоб звірити наявність заголовків у логах Vercel. */
export function logIpHeaders(headers: Headers, ip: string): void {
  console.log('[lead] rl_headers', {
    cfConnectingIp: Boolean(headers.get('cf-connecting-ip')),
    xff: Boolean(headers.get('x-forwarded-for')),
    xRealIp: Boolean(headers.get('x-real-ip')),
    ipResolved: ip !== UNKNOWN_IP,
  })
}
