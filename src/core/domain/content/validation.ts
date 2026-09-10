// core/domain/content/validation — валідація збереження контенту (лендинг, SEO, юр.документи)
// і завантаження картинок. Перенесено з роутів /api/admin/{content,seo,legal,content/upload}.
import { z } from 'zod'
import { isSafeImageUrl, isSafeHref, isTelegramUrl, type LandingContentOverrides } from './landing'

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

/**
 * Санітизує FAQ і перевіряє URL (картинки next/image; href кейсів — захист від javascript:;
 * кнопка Telegram — лише t.me/telegram.me). Мутує overrides.faq (як і було).
 */
export function validateLandingOverrides(overrides: unknown): Plan<LandingContentOverrides> {
  if (!overrides || typeof overrides !== 'object') return { ok: false, message: 'overrides is required' }
  const o = overrides as LandingContentOverrides

  if (o.faq !== undefined) {
    if (!Array.isArray(o.faq)) return { ok: false, message: 'faq має бути масивом' }
    o.faq = o.faq
      .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim().length > 0)
      .map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 2000) }))
  }

  for (const it of o.services?.items ?? []) {
    if (!isSafeImageUrl(it.mockup ?? null) || !isSafeImageUrl(it.mockupFull ?? null)) {
      return { ok: false, message: 'Недопустиме зображення послуги (лише /… або https://…supabase.co)' }
    }
  }
  for (const m of o.about?.members ?? []) {
    if (!isSafeImageUrl(m.photo ?? null)) {
      return { ok: false, message: 'Недопустиме фото учасника (лише /… або https://…supabase.co)' }
    }
  }
  if (!isTelegramUrl(o.site?.telegramCtaUrl)) {
    return { ok: false, message: 'Посилання кнопки Telegram — лише https://t.me/… або https://telegram.me/…' }
  }
  for (const g of o.trust?.caseGroups ?? []) {
    for (const c of g.cases ?? []) {
      if (!isSafeImageUrl(c.image ?? null)) {
        return { ok: false, message: 'Недопустиме зображення кейса (лише /… або https://…supabase.co)' }
      }
      if (!isSafeHref(c.href ?? null)) {
        return { ok: false, message: 'Недопустиме посилання кейса (лише http/https)' }
      }
    }
  }
  return { ok: true, value: o }
}

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
