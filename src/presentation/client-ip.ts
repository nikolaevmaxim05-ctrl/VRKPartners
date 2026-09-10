// presentation/client-ip — клієнтський IP для rate-limit / dedup.
// Фаза 2: поведінка без змін. Фаза 4: цепочка розділу 8 стандарту
// (cf-connecting-ip → перший x-forwarded-for → x-real-ip → 'unknown').
//
// Поточний порядок (усі заголовки ставить Vercel):
//   1) x-real-ip; 2) x-vercel-forwarded-for (перший сегмент);
//   3) x-forwarded-for — ПРАВИЙ сегмент (S5: лівий контролює клієнт).
// Не визначено → null (без спільного ключа-константи для всіх відвідувачів).
export function getClientIp(headers: Headers): string | null {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const vercelFwd = headers.get('x-vercel-forwarded-for')
  if (vercelFwd) {
    const first = vercelFwd.split(',')[0]?.trim()
    if (first) return first
  }

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return null
}

/** Лог без сирого IP (PII) — щоб звірити наявність заголовків у логах Vercel. */
export function logIpHeaders(headers: Headers, ip: string | null): void {
  console.log('[lead] rl_headers', {
    xRealIp: Boolean(headers.get('x-real-ip')),
    xVercelFwd: Boolean(headers.get('x-vercel-forwarded-for')),
    xff: Boolean(headers.get('x-forwarded-for')),
    ipResolved: ip !== null,
  })
}
