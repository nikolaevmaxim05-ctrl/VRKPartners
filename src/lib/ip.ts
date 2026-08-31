// Визначення надійного клієнтського IP для rate-limit / dedup.
//
// Порядок джерел (усі — виставляються платформою Vercel, клієнт їх не підробить):
//   1) x-real-ip              — Vercel ставить справжній IP клієнта;
//   2) x-vercel-forwarded-for — теж платформенний; ПЕРШИЙ сегмент = клієнт;
//   3) x-forwarded-for        — поза Vercel: ПРАВИЙ сегмент (найближчий до сервера
//                               проксі), а НЕ лівий (S5: лівий контролюється клієнтом
//                               і дозволяв би ротацією XFF обійти rate-limit/dedup).
//
// Якщо IP визначити не вдалося — повертаємо null. Викликаючий код НЕ використовує
// спільний ключ-константу («unknown»): інакше УСІ відвідувачі потрапляють в один
// лічильник rate-limit і кілька заявок від різних людей вичерпують спільний ліміт.
//
// Прим.: NextRequest.ip прибрано у Next.js 15 — спираємось лише на заголовки.
export function getClientIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const vercelFwd = headers.get("x-vercel-forwarded-for");
  if (vercelFwd) {
    const first = vercelFwd.split(",")[0]?.trim();
    if (first) return first;
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return null;
}
