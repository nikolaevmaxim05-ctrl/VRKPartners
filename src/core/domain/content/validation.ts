// core/domain/content/validation — валідація збереження SEO та юр.документів і завантаження
// картинок. Тексти сайту перевіряє limits.ts (validateMessages) за розділом 9.
import { z } from 'zod'

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

// Контакти (phone/email/telegram) у SEO не входять — вони в контенті лендингу.
// z.object стриже невідомі ключі, тож старі оверрайди ігноруються.
export const seoOverridesSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(500).optional(),
  ogImage: z.string().max(500).optional(),
  orgName: z.string().max(200).optional(),
  orgDescription: z.string().max(500).optional(),
})

const legalSectionSchema = z.object({
  heading: z.string().max(300),
  paragraphs: z.array(z.string().max(6000)).max(60),
  items: z.array(z.string().max(1500)).max(60).optional(),
})
const legalDocSchema = z.object({ sections: z.array(legalSectionSchema).max(80) })
export const legalOverridesSchema = z.object({
  privacy: legalDocSchema.optional(),
  offer: legalDocSchema.optional(),
})

// ── Завантаження картинок ────────────────────────────────────────────────────

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
// SVG навмисно виключено (може містити скрипт; next/image не оптимізує віддалені SVG).
export const IMAGE_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
}

export function validateImageUpload(type: string, size: number): Plan<{ ext: string }> {
  if (!IMAGE_ALLOWED_TYPES.has(type)) return { ok: false, message: 'Дозволені лише зображення: png, jpg, webp, gif' }
  if (size > IMAGE_MAX_BYTES) return { ok: false, message: 'Максимальний розмір — 5 МБ' }
  return { ok: true, value: { ext: EXT_BY_TYPE[type] ?? 'bin' } }
}

/** Тип зображення за магічними байтами (MIME з клієнта не довіряємо) або null. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

/** Вміст файлу має відповідати заявленому типу. */
export function validateImageBytes(type: string, bytes: Uint8Array): Plan<true> {
  if (sniffImageType(bytes) !== type) return { ok: false, message: 'Вміст файлу не відповідає типу зображення' }
  return { ok: true, value: true }
}

/** `<timestamp>-<6 символів>.<ext>` */
export function buildUploadPath(nowMs: number, random: string, ext: string): string {
  return `${nowMs}-${random}.${ext}`
}

/** Шлях обʼєкта НАШОГО bucket із публічного URL (для видалення попереднього файлу) або null. */
export function extractOwnObjectPath(previousUrl: string, marker: string): string | null {
  const idx = previousUrl.indexOf(marker)
  if (idx === -1) return null
  const path = previousUrl.slice(idx + marker.length)
  return path || null
}
