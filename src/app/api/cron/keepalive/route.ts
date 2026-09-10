// GET /api/cron/keepalive — легкий пінг Supabase, щоб проєкт не засинав (Vercel Cron).
import { NextResponse } from 'next/server'
import { getCronSecret, getKeepalive } from '@composition/container'
import { errorResponse } from '@/presentation/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${getCronSecret()}`) {
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
