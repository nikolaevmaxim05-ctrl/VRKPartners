import { requireSectionAccess } from '@/lib/admin-guard'
import { getLandingContentOverrides, mergeLandingContent } from '@/lib/content'
import { ContentForm } from '@/components/admin/content-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Контент | Адмін' }

export default async function ContentPage() {
  await requireSectionAccess(['manage_content'])

  const overrides = await getLandingContentOverrides()
  const content = mergeLandingContent(overrides)

  const initial = {
    site: {
      phone: content.site.phone,
      phoneHref: content.site.phoneHref,
      email: content.site.email,
      telegram: content.site.telegram,
      telegramHandle: content.site.telegramHandle,
      geo: content.site.geo,
    },
    hero: {
      title: content.hero.title,
      subtitle: content.hero.subtitle,
      trust: content.hero.trust,
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
    services: content.services,
    trust: content.trust,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Контент лендингу</h1>
        <p className="text-muted-foreground">
          Редагуйте тексти першого екрана, фінального блоку, контакти та FAQ.
          Зміни застосовуються на сайті одразу, без деплою.
        </p>
      </div>
      <ContentForm initial={initial} />
    </div>
  )
}
