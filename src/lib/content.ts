// Редаговані з адмінки оверрайди контенту лендингу.
// Дефолти живуть у config/site.ts і завжди є фолбеком — якщо в БД порожньо
// або сталася помилка, лендинг рендериться як раніше (нічого не ламається).
//
// Зберігання: таблиця site_content, один рядок id='landing', колонка data (JSONB)
// містить лише ЗМІНЕНІ поля (partial override), напр.:
//   { "hero": { "title": "..." }, "faq": [ { "q": "...", "a": "..." } ] }

import { site, hero, usp, about, finalCta, faq, services, trust, audit, workflow } from '@/config/site'

export const LANDING_CONTENT_ID = 'landing'

export type FaqItem = { q: string; a: string }

// ── Унікальні переваги (USP) ─────────────────────────────────────────────────
export type UspItem = { title: string; text: string }
export type UspContent = {
  eyebrow: string
  title: string
  text: string
  items: UspItem[]
}

// ── Про нас (команда) ────────────────────────────────────────────────────────
export type AboutMember = {
  key: string
  name: string
  photo: string
  experience: string
  role: string
  skills: string
}
export type AboutContent = {
  eyebrow: string
  title: string
  text: string
  members: AboutMember[]
}

// ── Аудит (блок 3) ───────────────────────────────────────────────────────────
export type AuditItem = { name: string; icon?: string; desc: string; points: string[] }
export type AuditContent = {
  eyebrow: string
  title: string
  cta: string
  ctaSecondary: string
  items: AuditItem[]
  formTitle: string
  services: string[]
}

// ── Процес (блок 5) ──────────────────────────────────────────────────────────
export type WorkflowStep = { n: number; title: string }
export type WorkflowTerm = { label: string; value: string; highlight?: string }
export type WorkflowBonus = {
  badge: string
  title: string
  desc: string
  terms: WorkflowTerm[]
  cta: string
}
export type WorkflowContent = {
  eyebrow: string
  title: string
  cta: string
  steps: WorkflowStep[]
  bonus: WorkflowBonus
}

// ── Послуги (блок 2) ─────────────────────────────────────────────────────────
export type ServiceItem = {
  key: string
  name: string
  desc: string
  mockup?: string
  mockupFull?: string
  mockupAlt?: string
  previewWide?: boolean
}
export type ServicesContent = {
  eyebrow: string
  title: string
  text: string
  cta: string
  items: ServiceItem[]
  // popup — тексти модалки; не редагуються у формі, лишаються з дефолтів
  popup?: { title: string; note: string }
}

// ── Кейси (блок 4) ───────────────────────────────────────────────────────────
export type CaseMetric = { value: string; label: string }
export type CaseItem = {
  id: string
  client: string
  href?: string
  title: string
  task?: string
  image?: string
  metrics: CaseMetric[]
  approach?: string[]
}
export type CaseGroup = { id: string; niche: string; cases: CaseItem[] }
export type TrustContent = {
  eyebrow: string
  title: string
  facts: string[]
  highlights: CaseMetric[]
  niches: string[]
  cta: string
  ctaSecondary: string
  caseHint: string
  caseGroups: CaseGroup[]
}

/** Форма оверрайдів (усі поля опційні — редагуємо лише те, що треба). */
export type LandingContentOverrides = {
  site?: Partial<{
    phone: string
    phoneHref: string
    email: string
    telegram: string
    telegramHandle: string
    geo: string
  }>
  hero?: Partial<{
    title: string
    subtitle: string
    trust: string
    primaryCta: string
    secondaryCta: string
    formTitle: string
    formNote: string
  }>
  finalCta?: Partial<{
    title: string
    text: string
    primaryCta: string
  }>
  usp?: Partial<UspContent>
  about?: Partial<AboutContent>
  faq?: FaqItem[]
  services?: Partial<ServicesContent>
  trust?: Partial<TrustContent>
  audit?: Partial<AuditContent>
  workflow?: Partial<WorkflowContent>
}

/** Повний контент лендингу після мержу дефолтів з оверрайдами.
 * Значення — рядки (усі поля site/hero/finalCta у config є рядками), тож
 * Record<string,string> точний і не конфліктує з літеральними типами `as const`. */
export type LandingContent = {
  site: Record<string, string>
  hero: Record<string, string>
  usp: UspContent
  about: AboutContent
  finalCta: Record<string, string>
  faq: readonly FaqItem[]
  services: ServicesContent
  trust: TrustContent
  audit: AuditContent
  workflow: WorkflowContent
}

/** Глибока копія (знімає readonly/літеральні типи `as const`). Повертає unknown,
 * щоб результат можна було привести до мутабельного типу без конфлікту readonly. */
function clone(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v))
}

/** Дефолти з config/site.ts у мутабельному вигляді. */
export function getDefaultLandingContent(): LandingContent {
  return {
    site: { ...site },
    hero: { ...hero },
    usp: clone(usp) as UspContent,
    about: clone(about) as AboutContent,
    finalCta: { ...finalCta },
    faq: [...faq],
    services: clone(services) as ServicesContent,
    trust: clone(trust) as TrustContent,
    audit: clone(audit) as AuditContent,
    workflow: clone(workflow) as WorkflowContent,
  }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди ігноруються. */
export function mergeLandingContent(
  overrides: LandingContentOverrides | null | undefined
): LandingContent {
  const base = getDefaultLandingContent()
  if (!overrides || typeof overrides !== 'object') return base

  return {
    site: { ...base.site, ...cleanStrings(overrides.site) },
    hero: { ...base.hero, ...cleanStrings(overrides.hero) },
    usp: mergeUsp(base.usp, overrides.usp),
    about: mergeAbout(base.about, overrides.about),
    finalCta: { ...base.finalCta, ...cleanStrings(overrides.finalCta) },
    faq:
      Array.isArray(overrides.faq) && overrides.faq.length > 0
        ? overrides.faq
            .filter(
              (f): f is FaqItem =>
                !!f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim().length > 0
            )
            .map((f) => ({ q: f.q, a: f.a }))
        : base.faq,
    services: mergeServices(base.services, overrides.services),
    trust: mergeTrust(base.trust, overrides.trust),
    audit: mergeAudit(base.audit, overrides.audit),
    workflow: mergeWorkflow(base.workflow, overrides.workflow),
  }
}

/** Мерж блоку «Унікальні переваги»: заголовкові рядки + пункти (title/text). */
function mergeUsp(base: UspContent, ov?: Partial<UspContent>): UspContent {
  if (!ov || typeof ov !== 'object') return base
  const out: UspContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (typeof ov.text === 'string') out.text = ov.text
  if (Array.isArray(ov.items) && ov.items.length > 0) {
    out.items = ov.items
      .filter((it) => it && typeof it.title === 'string')
      .map((it) => ({ title: String(it.title ?? ''), text: String(it.text ?? '') }))
  }
  return out
}

/** Мерж блоку «Про нас»: заголовкові рядки + учасники (фото/досвід/роль/навички). */
function mergeAbout(base: AboutContent, ov?: Partial<AboutContent>): AboutContent {
  if (!ov || typeof ov !== 'object') return base
  const out: AboutContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (typeof ov.text === 'string') out.text = ov.text
  if (Array.isArray(ov.members) && ov.members.length > 0) {
    out.members = ov.members
      .filter((m) => m && typeof m.name === 'string')
      .map((m, i) => ({
        key: typeof m.key === 'string' && m.key ? m.key : `member-${i + 1}`,
        name: String(m.name ?? ''),
        photo: String(m.photo ?? ''),
        experience: String(m.experience ?? ''),
        role: String(m.role ?? ''),
        skills: String(m.skills ?? ''),
      }))
  }
  return out
}

/** Мерж блоку «Аудит»: рядкові поля + items (name/desc/points) + services. */
function mergeAudit(base: AuditContent, ov?: Partial<AuditContent>): AuditContent {
  if (!ov || typeof ov !== 'object') return base
  const out: AuditContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (s.cta) out.cta = s.cta
  if (s.ctaSecondary) out.ctaSecondary = s.ctaSecondary
  if (s.formTitle) out.formTitle = s.formTitle
  if (Array.isArray(ov.items) && ov.items.length > 0) {
    out.items = ov.items
      .filter((it) => it && typeof it.name === 'string')
      .map((it) => ({
        name: String(it.name ?? ''),
        icon: typeof it.icon === 'string' && it.icon ? it.icon : undefined,
        desc: String(it.desc ?? ''),
        points: Array.isArray(it.points) ? it.points.map(String) : [],
      }))
  }
  if (Array.isArray(ov.services) && ov.services.length > 0) out.services = ov.services.map(String)
  return out
}

/** Мерж блоку «Процес»: title/steps + бонус Google (title/desc/terms/cta). */
function mergeWorkflow(base: WorkflowContent, ov?: Partial<WorkflowContent>): WorkflowContent {
  if (!ov || typeof ov !== 'object') return base
  const out: WorkflowContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (s.cta) out.cta = s.cta
  if (Array.isArray(ov.steps) && ov.steps.length > 0) {
    out.steps = ov.steps
      .filter((st) => st && typeof st.title === 'string')
      .map((st, i) => ({
        n: typeof st.n === 'number' ? st.n : i + 1,
        title: String(st.title ?? ''),
      }))
  }
  if (ov.bonus && typeof ov.bonus === 'object') {
    const b = ov.bonus
    out.bonus = {
      ...base.bonus,
      ...(typeof b.badge === 'string' && b.badge ? { badge: b.badge } : {}),
      ...(typeof b.title === 'string' && b.title ? { title: b.title } : {}),
      ...(typeof b.desc === 'string' && b.desc ? { desc: b.desc } : {}),
      ...(typeof b.cta === 'string' && b.cta ? { cta: b.cta } : {}),
      ...(Array.isArray(b.terms) && b.terms.length > 0
        ? {
            terms: b.terms
              .filter((t) => t && typeof t.label === 'string')
              .map((t) => ({
                label: String(t.label ?? ''),
                value: String(t.value ?? ''),
                highlight: t.highlight ? String(t.highlight) : undefined,
              })),
          }
        : {}),
    }
  }
  return out
}

/** Мерж послуг: рядкові поля — якщо непорожні; items — якщо є непорожній масив. */
function mergeServices(base: ServicesContent, ov?: Partial<ServicesContent>): ServicesContent {
  if (!ov || typeof ov !== 'object') return base
  const out: ServicesContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (s.text) out.text = s.text
  if (s.cta) out.cta = s.cta
  if (Array.isArray(ov.items) && ov.items.length > 0) {
    out.items = ov.items
      .filter((it) => it && typeof it.name === 'string')
      .map((it, i) => ({
        key: typeof it.key === 'string' && it.key ? it.key : `svc-${i}`,
        name: String(it.name ?? ''),
        desc: String(it.desc ?? ''),
        mockup: it.mockup ? String(it.mockup) : undefined,
        mockupFull: it.mockupFull ? String(it.mockupFull) : undefined,
        mockupAlt: it.mockupAlt ? String(it.mockupAlt) : undefined,
        previewWide: Boolean(it.previewWide),
      }))
  }
  return out
}

/** Мерж блоку кейсів: рядкові поля + масиви (facts/highlights/niches/caseGroups). */
function mergeTrust(base: TrustContent, ov?: Partial<TrustContent>): TrustContent {
  if (!ov || typeof ov !== 'object') return base
  const out: TrustContent = { ...base }
  const s = cleanStrings(ov as Record<string, unknown>)
  if (s.eyebrow) out.eyebrow = s.eyebrow
  if (s.title) out.title = s.title
  if (s.cta) out.cta = s.cta
  if (s.ctaSecondary) out.ctaSecondary = s.ctaSecondary
  if (s.caseHint) out.caseHint = s.caseHint
  if (Array.isArray(ov.facts) && ov.facts.length > 0) out.facts = ov.facts.map(String)
  if (Array.isArray(ov.niches) && ov.niches.length > 0) out.niches = ov.niches.map(String)
  if (Array.isArray(ov.highlights) && ov.highlights.length > 0) {
    out.highlights = ov.highlights
      .filter((h) => h && typeof h.value === 'string')
      .map((h) => ({ value: String(h.value ?? ''), label: String(h.label ?? '') }))
  }
  if (Array.isArray(ov.caseGroups) && ov.caseGroups.length > 0) {
    out.caseGroups = ov.caseGroups
      .filter((g) => g && typeof g.niche === 'string')
      .map((g, gi) => ({
        id: typeof g.id === 'string' && g.id ? g.id : `niche-${gi}`,
        niche: String(g.niche ?? ''),
        cases: (Array.isArray(g.cases) ? g.cases : [])
          .filter((c) => c && typeof c.client === 'string')
          .map((c, ci) => ({
            id: typeof c.id === 'string' && c.id ? c.id : `case-${gi}-${ci}`,
            client: String(c.client ?? ''),
            href: c.href ? String(c.href) : undefined,
            title: String(c.title ?? ''),
            task: c.task ? String(c.task) : undefined,
            image: c.image ? String(c.image) : undefined,
            metrics: (Array.isArray(c.metrics) ? c.metrics : [])
              .filter((m) => m && typeof m.value === 'string')
              .map((m) => ({ value: String(m.value ?? ''), label: String(m.label ?? '') })),
            approach:
              Array.isArray(c.approach) && c.approach.length > 0
                ? c.approach.map(String)
                : undefined,
          })),
      }))
  }
  return out
}

/** Лишає тільки непорожні рядкові значення (щоб порожнє поле не затирало дефолт). */
function cleanStrings(obj: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return out
}

/**
 * Серверне читання оверрайдів із site_content. Захищене: будь-яка помилка →
 * порожній об'єкт (лендинг падає на дефолти config/site.ts).
 * Викликається тільки на сервері (createServiceClient).
 */
export async function getLandingContentOverrides(): Promise<LandingContentOverrides> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data, error } = await service
      .from('site_content')
      .select('data')
      .eq('id', LANDING_CONTENT_ID)
      .maybeSingle()

    if (error || !data?.data) return {}
    return data.data as LandingContentOverrides
  } catch {
    return {}
  }
}
