// POST /api/leads — приёмник заявок с лендинга (тонкий роут: запрос → сценарий submit-lead → ответ).
// Ответы (раздел 8): 400 Invalid data · 429 Too many requests (+ Retry-After) · 500 DB error ·
// иначе { ok: true } (honeypot отвечает так же; повтор — { ok: true, duplicate: true }).
import { NextRequest, NextResponse } from 'next/server'
import { getSubmitLead } from '@composition/container'
import { errorResponse, readJson } from '@/presentation/http'
import { getClientIp, logIpHeaders } from '@/presentation/client-ip'
import { REF_COOKIE } from '@core/domain/referral/code'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const parsed = await readJson(request, 'Invalid data')
  if (!parsed.ok) return parsed.response
  logIpHeaders(request.headers, ip)

  let result
  try {
    result = await getSubmitLead()(parsed.body, {
      ip,
      userAgent: request.headers.get('user-agent'),
      referralCookie: request.cookies.get(REF_COOKIE)?.value ?? null,
    })
  } catch (err) {
    // Неожиданное исключение (напр. сборка контейнера без env) — ответ со стандартным телом, не пустой 500.
    console.error('[lead] unexpected', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (result.ok) return NextResponse.json(result.value.duplicate ? { ok: true, duplicate: true } : { ok: true })
  if (result.code === 'rate_limited') {
    const retryAfter = Number(result.details?.retryAfter ?? 600)
    return NextResponse.json(
      { error: result.message, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }
  return errorResponse(result)
}
