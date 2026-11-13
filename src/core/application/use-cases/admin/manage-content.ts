// use-cases/admin/manage-content — тексты сайта (messages + правки клиента), метаданные (SEO),
// юр.документы, картинки. Сохраняем только дифф от дефолтов (раздел 9); optimistic-lock по
// updated_at; после сохранения — revalidate сайта.
import { ok, fail, type Result } from '../../result'
import type { Actor, CacheInvalidator, Clock } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
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
  validateImageBytes,
  IMAGE_MAX_BYTES,
  buildUploadPath,
  extractOwnObjectPath,
} from '../../../domain/content/validation'

/** Строка правок текстов для языка: `landing` = uk (отклонение 5); другие языки — `landing:<lang>`. */
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
  audit?: AuditLog
}) {
  const { content, defaults, storage, cache, clock } = deps
  const audit = deps.audit ?? noopAudit

  async function isStale(id: string, baseUpdatedAt: string | null | undefined): Promise<boolean> {
    return isStaleUpdate(await content.getUpdatedAt(id), baseUpdatedAt)
  }

  // ── Тексты сайта ───────────────────────────────────────────────────────────
  async function getMessageOverrides(locale = 'uk'): Promise<unknown> {
    return content.getData(landingContentId(locale))
  }

  /** Полные тексты для рендера: дефолты + правки. Ошибка БД → чистые дефолты (сайт не падает). */
  async function getMessages(locale = 'uk'): Promise<SiteMessages> {
    return mergeMessages(defaults.messages(locale), await getMessageOverrides(locale))
  }

  /** Для редактора: только редактируемые разделы (без pageMeta) + дефолты + версия строки. */
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
   * Сохранение: редактор шлёт ПОЛНЫЕ значения редактируемых разделов; чужой раздел → 400;
   * лимиты/URL/массивы/скрытые блоки → 400; дифф против дефолтов → БД; revalidate.
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
    // В журнал — только перечень изменённых разделов (сам дифф может быть большим).
    await audit.record(actor, 'content.save', `site_content/${id}`, { new: { sections: Object.keys(diff as object) } })
    return ok({ updatedAt: nowIso })
  }

  // ── Метаданные (SEO) — отклонение 2 ────────────────────────────────────────
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
    const seoDiff = diffSeo(overrides, defaults.seo())
    const res = await content.save(SEO_CONTENT_ID, seoDiff, nowIso, actor.id)
    if (!res.ok) return fail('failed', res.error)
    cache.invalidateSite()
    await audit.record(actor, 'seo.save', `site_content/${SEO_CONTENT_ID}`, { new: seoDiff })
    return ok({ updatedAt: nowIso })
  }

  // ── Юридические документы — отклонение 3 ───────────────────────────────────
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
    await audit.record(actor, 'legal.save', `site_content/${LEGAL_CONTENT_ID}`, { new: { docs: Object.keys(diff) } })
    return ok({ updatedAt: nowIso })
  }

  // ── Картинки ───────────────────────────────────────────────────────────────
  async function uploadImage(
    file: { type: string; size: number; read: () => Promise<Uint8Array> },
    previousUrl: string | null,
  ): Promise<Result<{ url: string }>> {
    // Тип и размер — ДО чтения тела (большое тело не буферизуется); содержимое — по магическим байтам.
    const v = validateImageUpload(file.type, file.size)
    if (!v.ok) return fail(file.size > IMAGE_MAX_BYTES ? 'too_large' : 'invalid', v.message)
    const bytes = await file.read()
    const b = validateImageBytes(file.type, bytes)
    if (!b.ok) return fail('invalid', b.message)
    const path = buildUploadPath(clock.now().getTime(), Math.random().toString(36).slice(2, 8), v.value.ext)

    const up = await storage.upload(path, bytes, file.type)
    if (!up.ok) return fail('failed', 'Не вдалося завантажити файл')

    // C14: удаляем предыдущий файл НАШЕГО bucket при замене.
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
