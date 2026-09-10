// core/application/ports/common — спільні типи портів.

/** Результат операції з БД: або дані, або текст помилки (+ код Postgres, напр. 23505). */
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

/** Код Postgres «unique_violation». */
export const UNIQUE_VIOLATION = '23505'

export const dbOk = <T>(data: T): DbResult<T> => ({ ok: true, data })
export const dbFail = <T = never>(error: string, code?: string): DbResult<T> =>
  code ? { ok: false, error, code } : { ok: false, error }

/** Хто виконує дію в адмінці. */
export type Actor = { id: string; email: string | null }

/** Годинник — щоб сценарії не залежали від new Date() напряму. */
export interface Clock {
  now(): Date
}

/** Скидання кешу сторінок сайту після змін з адмінки (revalidatePath). */
export interface CacheInvalidator {
  /** revalidatePath('/', 'layout') — весь сайт. */
  invalidateSite(): void
  /** revalidatePath(path) для конкретних сторінок. */
  invalidatePaths(paths: string[]): void
}
