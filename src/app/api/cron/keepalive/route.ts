// GET /api/cron/keepalive — легкий пінг Supabase, щоб проєкт не засинав (Vercel Cron).
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getCronSecret, getKeepalive } from '@composition/container'
import { errorResponse } from '@/presentation/http'

export const runtime = 'nodejs'

/** Порівняння сталим часом; різна довжина → false. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export async function GET(request: Request) {
  // Без CRON_SECRET у середовищі роут закритий (інакше «Bearer undefined» проходив би).
  const secret = getCronSecret()
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await getKeepalive()()
    return result.ok ? NextResponse.json({ ok: true, ts: result.value.ts }) : errorResponse(result)
  } catch (err) {
    console.error('[cron/keepalive] unexpected', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
