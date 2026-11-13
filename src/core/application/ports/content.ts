// core/application/ports/content — строки site_content (landing / seo / legal) и картинки.
import type { DbResult } from './common'

export interface ContentRepository {
  /** data строки. Любая ошибка/отсутствие → {} (сайт откатывается на дефолты). */
  getData(id: string): Promise<unknown>
  /** updated_at строки для optimistic-lock. Ошибка/отсутствие → null. */
  getUpdatedAt(id: string): Promise<string | null>
  save(id: string, data: unknown, updatedAtIso: string, userId: string): Promise<DbResult<void>>
}

export type UploadResult = { ok: true } | { ok: false; name: string; message: string }

/** Хранилище картинок контента (bucket `content`). */
export interface ImageStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<UploadResult>
  remove(path: string): Promise<void>
  publicUrl(path: string): string
  /** Маркер в публичном URL, по которому распознаём «наши» файлы. */
  readonly publicPathMarker: string
}

/** Дефолты текстов (из файлов) — сценарии контента сами их не читают. */
export interface ContentDefaults<Landing, Seo, Legal> {
  landing(): Landing
  seo(): Seo
  legal(): Legal
}
