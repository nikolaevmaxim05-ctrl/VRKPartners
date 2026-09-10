// use-cases/admin/manage-content — контент лендингу, метадані (SEO), юр.документи, картинки.
// Зберігаємо лише дифф від дефолтів; optimistic-lock по updated_at; після збереження — revalidate.
import { ok, fail, type Result } from '../../result'
import type { Actor, CacheInvalidator, Clock } from '../../ports/common'
import type { ContentRepository, ImageStorage } from '../../ports/content'
import {
  mergeLandingContent,
  diffLandingOverrides,
  isSafeImageUrl,
  type LandingContent,
  type LandingContentOverrides,
} from '../../../domain/content/landing'
import { mergeSeo, diffSeo, SEO_CONTENT_ID, type SeoMeta, type SeoOverrides } from '../../../domain/content/seo'
import {
  mergeLegalContent,
  diffLegalOverrides,
  LEGAL_CONTENT_ID,
  type LegalContent,
  type LegalOverrides,
} from '../../../domain/content/legal'
import { isStaleUpdate } from '../../../domain/content/optimistic-lock'
import {
  validateLandingOverrides,
  seoOverridesSchema,
  legalOverridesSchema,
  validateImageUpload,
  buildUploadPath,
  extractOwnObjectPath,
} from '../../../domain/content/validation'

export const LANDING_CONTENT_ID = 'landing'

export const LEGAL_PATHS = ['/polityka-konfidentsiynosti', '/publichna-oferta']

export type ContentDefaultsSource = {
  landing(): LandingContent
  seo(): SeoMeta
  legal(): LegalContent
}

type SaveBody = { overrides?: unknown; baseUpdatedAt?: string | null }

export function makeContentUseCases(deps: {
  content: ContentRepository
  defaults: ContentDefaultsSource
  storage: ImageStorage
  cache: CacheInvalidator
  clock: Clock
}) {
  const { content, defaults, storage, cache, clock } = deps

  async function isStale(id: string, baseUpdatedAt: string | null | undefined): Promise<boolean> {
    return isStaleUpdate(await content.getUpdatedAt(id), baseUpdatedAt)
  }

  // ── Лендинг ────────────────────────────────────────────────────────────────
  async function getLandingOverrides(): Promise<LandingContentOverrides> {
    return (await content.getData(LANDING_CONTENT_ID)) as LandingContentOverrides
  }

  async function getLanding() {
    const overrides = await getLandingOverrides()
    return { overrides, content: mergeLandingContent(defaults.landing(), overrides) }
  }

  async function getLandingForEditor() {
    const [overrides, updatedAt] = await Promise.all([getLandingOverrides(), content.getUpdatedAt(LANDING_CONTENT_ID)])
    return { content: mergeLandingContent(defaults.landing(), overrides), defaults: defaults.landing(), updatedAt }
  }

  async function saveLanding(body: SaveBody, actor: Actor): Promise<Result<{ updatedAt: string }>> {
    const v = validateLandingOverrides(body.overrides)
    if (!v.ok) return fail('invalid', v.message)
    if (await isStale(LANDING_CONTENT_ID, body.baseUpdatedAt)) {
      return fail('conflict', 'Контент змінив інший адміністратор. Оновіть сторінку й повторіть.')
    }
    const diff = diffLandingOverrides(v.value, defaults.landing())
    const nowIso = clock.now().toISOString()
    const res = await content.save(LANDING_CONTENT_ID, diff, nowIso, actor.id)
    if (!res.ok) return fail('failed', res.error)
    cache.invalidateSite()
    return ok({ updatedAt: nowIso })
  }

  // ── Метадані (SEO) — відхилення 2 ──────────────────────────────────────────
  async function getSeoOverrides(): Promise<SeoOverrides> {
    return (await content.getData(SEO_CONTENT_ID)) as SeoOverrides
  }

  async function getSeo() {
    const [overrides, updatedAt] = await Promise.all([getSeoOverrides(), content.getUpdatedAt(SEO_CONTENT_ID)])
    return { overrides, content: mergeSeo(defaults.seo(), overrides), defaults: defaults.seo(), updatedAt }
  }

  async function saveSeo(body: SaveBody, actor: Actor): Promise<Result<{ updatedAt: string }>> {
    const parsed = seoOverridesSchema.safeParse(body.overrides)
    if (!parsed.success) return fail('invalid', 'Невірний формат метаданих')
    const overrides = parsed.data as SeoOverrides
    if (!isSafeImageUrl(overrides.ogImage)) {
      return fail('invalid', 'Недопустима картинка OG (лише /… або https://…supabase.co)')
    }
    if (await isStale(SEO_CONTENT_ID, body.baseUpdatedAt)) {
      return fail('conflict', 'Метадані змінив інший адміністратор. Оновіть сторінку й повторіть.')
    }
    const nowIso = clock.now().toISOString()
    const res = await content.save(SEO_CONTENT_ID, diffSeo(overrides, defaults.seo()), nowIso, actor.id)
    if (!res.ok) return fail('failed', res.error)
    cache.invalidateSite()
    return ok({ updatedAt: nowIso })
  }

  // ── Юридичні документи — відхилення 3 ──────────────────────────────────────
  async function getLegal() {
    const [overrides, updatedAt] = await Promise.all([
      content.getData(LEGAL_CONTENT_ID) as Promise<LegalOverrides>,
      content.getUpdatedAt(LEGAL_CONTENT_ID),
    ])
    return { overrides, content: mergeLegalContent(defaults.legal(), overrides), updatedAt }
  }

  async function saveLegal(body: SaveBody, actor: Actor): Promise<Result<{ updatedAt: string }>> {
    const parsed = legalOverridesSchema.safeParse(body.overrides)
    if (!parsed.success) return fail('invalid', 'Невірний формат документів')
    if (await isStale(LEGAL_CONTENT_ID, body.baseUpdatedAt)) {
      return fail('conflict', 'Документи змінив інший адміністратор. Оновіть сторінку й повторіть.')
    }
    const nowIso = clock.now().toISOString()
    const diff = diffLegalOverrides(parsed.data as LegalOverrides, defaults.legal())
    const res = await content.save(LEGAL_CONTENT_ID, diff, nowIso, actor.id)
    if (!res.ok) return fail('failed', res.error)
    cache.invalidatePaths(LEGAL_PATHS)
    return ok({ updatedAt: nowIso })
  }

  // ── Картинки ───────────────────────────────────────────────────────────────
  async function uploadImage(
    file: { type: string; size: number; bytes: Uint8Array },
    previousUrl: string | null,
  ): Promise<Result<{ url: string }>> {
    const v = validateImageUpload(file.type, file.size)
    if (!v.ok) return fail('invalid', v.message)
    const path = buildUploadPath(clock.now().getTime(), Math.random().toString(36).slice(2, 8), v.value.ext)

    const up = await storage.upload(path, file.bytes, file.type)
    if (!up.ok) return fail('failed', 'Не вдалося завантажити файл')

    // C14: видаляємо попередній файл НАШОГО bucket при заміні.
    if (previousUrl) {
      const oldPath = extractOwnObjectPath(previousUrl, storage.publicPathMarker)
      if (oldPath && oldPath !== path) await storage.remove(oldPath)
    }
    return ok({ url: storage.publicUrl(path) })
  }

  return {
    getLandingOverrides,
    getLanding,
    getLandingForEditor,
    saveLanding,
    getSeoOverrides,
    getSeo,
    saveSeo,
    getLegal,
    saveLegal,
    uploadImage,
  }
}
