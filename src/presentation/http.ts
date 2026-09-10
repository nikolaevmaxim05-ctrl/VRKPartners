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

/** { error, ...details } зі статусом за кодом помилки. */
export function errorResponse(err: Err): NextResponse {
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

/** Геттер query-параметра для сценаріїв. */
export function queryGetter(request: Request): (key: string) => string | null {
  const { searchParams } = new URL(request.url)
  return (key) => searchParams.get(key)
}
