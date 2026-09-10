// core/application/ports/content — рядки site_content (landing / seo / legal) і картинки.
import type { DbResult } from './common'

export interface ContentRepository {
  /** data рядка. Будь-яка помилка/відсутність → {} (сайт падає на дефолти). */
  getData(id: string): Promise<unknown>
  /** updated_at рядка для optimistic-lock. Помилка/відсутність → null. */
  getUpdatedAt(id: string): Promise<string | null>
  save(id: string, data: unknown, updatedAtIso: string, userId: string): Promise<DbResult<void>>
}

export type UploadResult = { ok: true } | { ok: false; name: string; message: string }

/** Сховище картинок контенту (bucket `content`). */
export interface ImageStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<UploadResult>
  remove(path: string): Promise<void>
  publicUrl(path: string): string
  /** Маркер у публічному URL, за яким розпізнаємо «наші» файли. */
  readonly publicPathMarker: string
}

/** Дефолти текстів (з файлів) — сценарії контенту їх не читають самі. */
export interface ContentDefaults<Landing, Seo, Legal> {
  landing(): Landing
  seo(): Seo
  legal(): Legal
}
