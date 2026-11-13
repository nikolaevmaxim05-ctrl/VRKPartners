// infrastructure/supabase/storage — картинки контента в bucket `content` (публичный, до 5 МБ, без SVG).
import type { Db } from './service'
import type { ImageStorage } from '@core/application/ports/content'

const BUCKET = 'content'

export function makeImageStorage(db: () => Db): ImageStorage {
  return {
    publicPathMarker: `/storage/v1/object/public/${BUCKET}/`,

    async upload(path, bytes, contentType) {
      const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
      if (error) {
        // Логируем РЕАЛЬНУЮ причину (напр. «Bucket not found» после переезда на новый проект).
        console.error('[content-upload] upload_failed', { bucket: BUCKET, name: error.name, message: error.message })
        return { ok: false, name: error.name, message: error.message }
      }
      return { ok: true }
    },

    async remove(path) {
      try {
        await db().storage.from(BUCKET).remove([path])
      } catch (e) {
        console.error('[content/upload] old_file_remove_failed', e)
      }
    },

    publicUrl(path) {
      return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}
