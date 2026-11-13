// core/application/ports/common — общие типы портов.

/** Результат операции с БД: либо данные, либо текст ошибки (+ код Postgres, напр. 23505). */
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

/** Код Postgres «unique_violation». */
export const UNIQUE_VIOLATION = '23505'

export const dbOk = <T>(data: T): DbResult<T> => ({ ok: true, data })
export const dbFail = <T = never>(error: string, code?: string): DbResult<T> =>
  code ? { ok: false, error, code } : { ok: false, error }

/** Кто выполняет действие в админке. ip — из цепочки заголовков (для audit_log), 'unknown' → null. */
export type Actor = { id: string; email: string | null; ip?: string | null }

/** Часы — чтобы сценарии не зависели от new Date() напрямую. */
export interface Clock {
  now(): Date
}

/** Сброс кэша страниц сайта после изменений из админки (revalidatePath). */
export interface CacheInvalidator {
  /** revalidatePath('/', 'layout') — весь сайт. */
  invalidateSite(): void
  /** revalidatePath(path) для конкретных страниц. */
  invalidatePaths(paths: string[]): void
}
