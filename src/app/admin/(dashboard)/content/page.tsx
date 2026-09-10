import { getContentUseCases } from '@composition/container'
import { requireSectionAccess } from '@/presentation/admin-page'
import { site, siteUrl } from '@/shared/config/site'
import { ContentTabs } from '@/features/admin/components/content-tabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Контент | Адмін' }

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSectionAccess(['manage_content'])

  const content = getContentUseCases()
  const [landing, seo, sp] = await Promise.all([content.getLandingForEditor(), content.getSeo(), searchParams])
  const c = landing.content
  const initialTab = sp?.tab === 'meta' ? 'meta' : 'content'

  const initial = {
    site: {
      phone: c.site.phone,
      phoneHref: c.site.phoneHref,
      email: c.site.email,
      telegram: c.site.telegram,
      telegramHandle: c.site.telegramHandle,
      telegramCtaUrl: c.site.telegramCtaUrl,
      telegramCtaText: c.site.telegramCtaText,
    },
    hero: {
      title: c.hero.title,
      subtitle: c.hero.subtitle,
      trust: c.hero.trust,
      trustHref: c.hero.trustHref ?? '',
      partnerBadge: c.hero.partnerBadge ?? '',
      partnerTitle: c.hero.partnerTitle ?? '',
      partnerLinkText: c.hero.partnerLinkText ?? '',
      primaryCta: c.hero.primaryCta,
      secondaryCta: c.hero.secondaryCta,
      formTitle: c.hero.formTitle,
      formNote: c.hero.formNote,
    },
    finalCta: {
      title: c.finalCta.title,
      text: c.finalCta.text,
      primaryCta: c.finalCta.primaryCta,
    },
    faq: c.faq.map((f) => ({ q: f.q, a: f.a })),
    usp: c.usp,
    about: c.about,
    services: c.services,
    trust: c.trust,
    audit: c.audit,
    workflow: c.workflow,
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
          defaultServices: landing.defaults.services,
          defaultTrust: landing.defaults.trust,
          defaultAbout: landing.defaults.about,
          baseUpdatedAt: landing.updatedAt,
        }}
        meta={{
          initial: seo.content,
          defaults: seo.defaults,
          baseUpdatedAt: seo.updatedAt,
          siteUrl,
          siteName: site.name,
          contacts: { phone: c.site.phone, email: c.site.email, telegram: c.site.telegram },
        }}
      />
    </div>
  )
}
