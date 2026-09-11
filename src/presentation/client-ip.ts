// presentation/client-ip — клієнтський IP для rate-limit / dedup (ланцюжок розділу 8):
//   cf-connecting-ip → перший сегмент x-forwarded-for → x-real-ip → 'unknown'.
// На Vercel x-forwarded-for виставляє платформа (клієнтський спуфінг неможливий).
// Кожен кандидат має бути синтаксично коректним IPv4/IPv6 (колонки leads.ip_address і
// audit_log.ip_address — inet): сміття в заголовку (напр. довільний cf-connecting-ip від клієнта)
// не має валити запис ліда — пропускаємо його і йдемо далі ланцюжком.
// 'unknown' — сценарій пропускає ліміт і дедуп за IP, у БД пише NULL (відхилення 10).
import { isIP } from 'node:net'

export const UNKNOWN_IP = 'unknown'

/** Кандидат з заголовка → IP або null (порожній чи не-IP). */
function validIp(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  return isIP(v) === 0 ? null : v
}

export function getClientIp(headers: Headers): string {
  const cf = validIp(headers.get('cf-connecting-ip'))
  if (cf) return cf

  const xff = validIp(headers.get('x-forwarded-for')?.split(',')[0])
  if (xff) return xff

  const realIp = validIp(headers.get('x-real-ip'))
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
