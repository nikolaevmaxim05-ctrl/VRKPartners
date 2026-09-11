// use-cases/admin/manage-content — тексти сайту (messages + правки клієнта), метадані (SEO),
// юр.документи, картинки. Зберігаємо лише дифф від дефолтів (розділ 9); optimistic-lock по
// updated_at; після збереження — revalidate сайту.
import { ok, fail, type Result } from '../../result'
import type { Actor, CacheInvalidator, Clock } from '../../ports/common'
import type { ContentRepository, ImageStorage } from '../../ports/content'
import { mergeMessages, diffMessages, pickEditable } from '../../../domain/content/messages'
import { validateMessages } from '../../../domain/content/limits'
import type { SiteMessages } from '../../../domain/content/site-messages'
import { isSafeImageUrl } from '../../../domain/content/landing'
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
  seoOverridesSchema,
  legalOverridesSchema,
  validateImageUpload,
  buildUploadPath,
  extractOwnObjectPath,
} from '../../../domain/content/validation'

/** Рядок правок текстів для мови: `landing` = uk (відхилення 5); інші мови — `landing:<lang>`. */
export function landingContentId(locale: string): string {
  return locale === 'uk' ? 'landing' : `landing:${locale}`
}

export const LANDING_CONTENT_ID = landingContentId('uk')

export const LEGAL_PATHS = ['/polityka-konfidentsiynosti', '/publichna-oferta']

export type ContentDefaultsSource = {
  messages(locale: string): SiteMessages
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

  // ── Тексти сайту ───────────────────────────────────────────────────────────
  async function getMessageOverrides(locale = 'uk'): Promise<unknown> {
    return content.getData(landingContentId(locale))
  }

  /** Повні тексти для рендеру: дефолти + правки. Помилка БД → чисті дефолти (сайт не падає). */
  async function getMessages(locale = 'uk'): Promise<SiteMessages> {
    return mergeMessages(defaults.messages(locale), await getMessageOverrides(locale))
  }

  /** Для редактора: лише редаговані розділи (без pageMeta) + дефолти + версія рядка. */
  async function getMessagesForEditor(locale = 'uk') {
    const [overrides, updatedAt] = await Promise.all([getMessageOverrides(locale), content.getUpdatedAt(landingContentId(locale))])
    const base = defaults.messages(locale)
    return {
      messages: pickEditable(mergeMessages(base, overrides)),
      defaults: pickEditable(base),
      updatedAt,
    }
  }

  /**
   * Збереження: редактор шле ПОВНІ значення редагованих розділів; чужий розділ → 400;
   * ліміти/URL/масиви/приховані блоки → 400; дифф проти дефолтів → БД; revalidate.
   */
  async function saveMessages(body: SaveBody, actor: Actor, locale = 'uk'): Promise<Result<{ updatedAt: string }>> {
    const base = defaults.messages(locale)
    const v = validateMessages(pickEditable(base), body.overrides)
    if (!v.ok) return fail('invalid', v.error.path ? `${v.error.path}: ${v.error.message}` : v.error.message)
    const id = landingContentId(locale)
    if (await isStale(id, body.baseUpdatedAt)) {
      return fail('conflict', 'Контент змінив інший адміністратор. Оновіть сторінку й повторіть.')
    }
    const diff = diffMessages(pickEditable(base), v.value) ?? {}
    const nowIso = clock.now().toISOString()
    const res = await content.save(id, diff, nowIso, actor.id)
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
    getMessageOverrides,
    getMessages,
    getMessagesForEditor,
    saveMessages,
    getSeoOverrides,
    getSeo,
    saveSeo,
    getLegal,
    saveLegal,
    uploadImage,
  }
}
