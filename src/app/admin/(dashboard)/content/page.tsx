import { requireSectionAccess } from '@/lib/admin-guard'
import {
  getLandingContentOverrides,
  getLandingContentUpdatedAt,
  mergeLandingContent,
  getDefaultLandingContent,
} from '@/lib/content'
import {
  getSeoOverrides,
  mergeSeo,
  getDefaultSeo,
  getSeoUpdatedAt,
} from '@/lib/seo'
import { siteUrl } from '@/config/site'
import { ContentTabs } from '@/components/admin/content-tabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Контент | Адмін' }

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireSectionAccess(['manage_content'])

  const [overrides, updatedAt, seoOverrides, seoUpdatedAt, sp] = await Promise.all([
    getLandingContentOverrides(),
    getLandingContentUpdatedAt(),
    getSeoOverrides(),
    getSeoUpdatedAt(),
    searchParams,
  ])
  const content = mergeLandingContent(overrides)
  const defaults = getDefaultLandingContent()
  const seoContent = mergeSeo(seoOverrides)
  const seoDefaults = getDefaultSeo()
  const initialTab = sp?.tab === 'meta' ? 'meta' : 'content'

  const initial = {
    site: {
      phone: content.site.phone,
      phoneHref: content.site.phoneHref,
      email: content.site.email,
      telegram: content.site.telegram,
      telegramHandle: content.site.telegramHandle,
      telegramCtaUrl: content.site.telegramCtaUrl,
      telegramCtaText: content.site.telegramCtaText,
    },
    hero: {
      title: content.hero.title,
      subtitle: content.hero.subtitle,
      trust: content.hero.trust,
      trustHref: content.hero.trustHref ?? '',
      partnerBadge: content.hero.partnerBadge ?? '',
      partnerTitle: content.hero.partnerTitle ?? '',
      partnerLinkText: content.hero.partnerLinkText ?? '',
      primaryCta: content.hero.primaryCta,
      secondaryCta: content.hero.secondaryCta,
      formTitle: content.hero.formTitle,
      formNote: content.hero.formNote,
    },
    finalCta: {
      title: content.finalCta.title,
      text: content.finalCta.text,
      primaryCta: content.finalCta.primaryCta,
    },
    faq: content.faq.map((f) => ({ q: f.q, a: f.a })),
    usp: content.usp,
    about: content.about,
    services: content.services,
    trust: content.trust,
    audit: content.audit,
    workflow: content.workflow,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Контент лендингу</h1>
        <p className="text-muted-foreground">
          Редагуйте тексти лендингу та метадані (SEO). Зміни застосовуються на сайті
          одразу, без деплою.
        </p>
      </div>
      <ContentTabs
        initialTab={initialTab}
        content={{
          initial,
          defaultServices: defaults.services,
          defaultTrust: defaults.trust,
          defaultAbout: defaults.about,
          baseUpdatedAt: updatedAt,
        }}
        meta={{
          initial: seoContent,
          defaults: seoDefaults,
          baseUpdatedAt: seoUpdatedAt,
          siteUrl,
        }}
      />
    </div>
  )
}
