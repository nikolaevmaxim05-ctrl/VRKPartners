// core/application/result — результат сценария без HTTP.
// Презентация (presentation/http.ts) отображает коды в статусы ответа.

export type AppErrorCode =
  | 'invalid'       // 400
  | 'unauthorized'  // 401
  | 'forbidden'     // 403
  | 'not_found'     // 404
  | 'conflict'      // 409
  | 'too_large'     // 413
  | 'rate_limited'  // 429
  | 'unavailable'   // 503
  | 'failed'        // 500

export type Ok<T> = { ok: true; value: T }
export type Err = {
  ok: false
  code: AppErrorCode
  message: string
  /** Дополнительные поля тела ответа (напр. { code: 'TOO_MANY_ROWS' }, { retryAfter }). */
  details?: Record<string, unknown>
}
export type Result<T> = Ok<T> | Err

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })

export const fail = (code: AppErrorCode, message: string, details?: Record<string, unknown>): Err =>
  details ? { ok: false, code, message, details } : { ok: false, code, message }
