// presentation/conversions — HTTP-форма ответа повторной отправки (как и раньше: {ok, message}).
import { NextResponse } from 'next/server'
import type { ResendOutcome } from '@core/application/use-cases/admin/export-conversions'

export function resendResponse(outcome: ResendOutcome, notConfiguredMessage: string): NextResponse {
  if (outcome.kind === 'sent') return NextResponse.json({ ok: true })
  if (outcome.kind === 'not_configured') {
    return NextResponse.json({ ok: false, message: notConfiguredMessage }, { status: 400 })
  }
  return NextResponse.json({ ok: false, message: outcome.message }, { status: 500 })
}
