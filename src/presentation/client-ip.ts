// presentation/client-ip — клиентский IP для rate-limit / dedup (цепочка раздела 8):
//   cf-connecting-ip → первый сегмент x-forwarded-for → x-real-ip → 'unknown'.
// На Vercel x-forwarded-for выставляет платформа (клиентский спуфинг невозможен).
// Каждый кандидат должен быть синтаксически корректным IPv4/IPv6 (колонки leads.ip_address и
// audit_log.ip_address — inet): мусор в заголовке (напр. произвольный cf-connecting-ip от клиента)
// не должен валить запись лида — пропускаем его и идём дальше по цепочке.
// 'unknown' — сценарий пропускает лимит и дедуп по IP, в БД пишет NULL (отклонение 10).
import { isIP } from 'node:net'

export const UNKNOWN_IP = 'unknown'

/** Кандидат из заголовка → IP или null (пустой или не-IP). */
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

/** Лог без сырого IP (PII) — чтобы сверить наличие заголовков в логах Vercel. */
export function logIpHeaders(headers: Headers, ip: string): void {
  console.log('[lead] rl_headers', {
    cfConnectingIp: Boolean(headers.get('cf-connecting-ip')),
    xff: Boolean(headers.get('x-forwarded-for')),
    xRealIp: Boolean(headers.get('x-real-ip')),
    ipResolved: ip !== UNKNOWN_IP,
  })
}
