// POST /api/leads — приймач заявок з лендингу (тонкий роут: запит → сценарій submit-lead → відповідь).
import { NextRequest, NextResponse } from 'next/server'
import { getSubmitLead } from '@composition/container'
import { errorResponse, readJson } from '@/presentation/http'
import { getClientIp, logIpHeaders } from '@/presentation/client-ip'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const parsed = await readJson(request, 'Невірні дані')
  if (!parsed.ok) return parsed.response
  logIpHeaders(request.headers, ip)

  const result = await getSubmitLead()(parsed.body, { ip, userAgent: request.headers.get('user-agent') })

  if (result.ok) return NextResponse.json(result.value.duplicate ? { ok: true, duplicate: true } : { ok: true })
  if (result.code === 'rate_limited') {
    const retryAfter = Number(result.details?.retryAfter ?? 60)
    return NextResponse.json(
      { error: result.message, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }
  if (result.code === 'unavailable') {
    return NextResponse.json({ error: result.message }, { status: 503, headers: { 'Retry-After': '60' } })
  }
  return errorResponse(result)
}
