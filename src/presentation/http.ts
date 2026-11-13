// presentation/http — отображение результата сценария в HTTP-ответ.
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

/** Текст 500 для клиента: настоящая причина (часто сырой текст PostgREST) — только в лог сервера. */
export const GENERIC_FAILED_MESSAGE = 'Помилка сервера. Спробуйте ще раз пізніше.'

/** { error, ...details } со статусом по коду ошибки; для failed — обобщённое сообщение. */
export function errorResponse(err: Err): NextResponse {
  if (err.code === 'failed') {
    console.error('[api] failed:', err.message)
    return NextResponse.json({ error: GENERIC_FAILED_MESSAGE, ...(err.details ?? {}) }, { status: 500 })
  }
  return NextResponse.json({ error: err.message, ...(err.details ?? {}) }, { status: STATUS[err.code] })
}

/** Успех → toBody(value) (по умолчанию { data: value }), ошибка → errorResponse. */
export function respond<T>(result: Result<T>, toBody: (value: T) => unknown = (value) => ({ data: value })): NextResponse {
  return result.ok ? NextResponse.json(toBody(result.value)) : errorResponse(result)
}

/** Тело запроса как JSON; невалидный JSON → 400 { error: message }. */
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

/** Идентификатор в пути должен быть UUID: иначе 404 сразу (Postgres на «not-a-uuid» дал бы 500). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

/** Геттер query-параметра для сценариев. */
export function queryGetter(request: Request): (key: string) => string | null {
  const { searchParams } = new URL(request.url)
  return (key) => searchParams.get(key)
}
