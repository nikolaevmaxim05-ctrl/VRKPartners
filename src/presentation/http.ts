// presentation/http — відображення результату сценарію у HTTP-відповідь.
import { NextResponse } from 'next/server'
import type { AppErrorCode, Err, Result } from '@core/application/result'

const STATUS: Record<AppErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  rate_limited: 429,
  unavailable: 503,
  failed: 500,
}

export function statusOf(code: AppErrorCode): number {
  return STATUS[code]
}

/** Текст 500 для клієнта: справжня причина (часто сирий текст PostgREST) — лише в лог сервера. */
export const GENERIC_FAILED_MESSAGE = 'Помилка сервера. Спробуйте ще раз пізніше.'

/** { error, ...details } зі статусом за кодом помилки; для failed — узагальнене повідомлення. */
export function errorResponse(err: Err): NextResponse {
  if (err.code === 'failed') {
    console.error('[api] failed:', err.message)
    return NextResponse.json({ error: GENERIC_FAILED_MESSAGE, ...(err.details ?? {}) }, { status: 500 })
  }
  return NextResponse.json({ error: err.message, ...(err.details ?? {}) }, { status: STATUS[err.code] })
}

/** Успіх → toBody(value) (за замовчуванням { data: value }), помилка → errorResponse. */
export function respond<T>(result: Result<T>, toBody: (value: T) => unknown = (value) => ({ data: value })): NextResponse {
  return result.ok ? NextResponse.json(toBody(result.value)) : errorResponse(result)
}

/** Тіло запиту як JSON; невалідний JSON → 400 { error: message }. */
export async function readJson<T = Record<string, unknown>>(
  request: Request,
  message = 'Invalid JSON',
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: (await request.json()) as T }
  } catch {
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) }
  }
}

/** Ідентифікатор у шляху має бути UUID: інакше 404 одразу (Postgres на «not-a-uuid» дав би 500). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

/** Геттер query-параметра для сценаріїв. */
export function queryGetter(request: Request): (key: string) => string | null {
  const { searchParams } = new URL(request.url)
  return (key) => searchParams.get(key)
}
