import { getContentUseCases } from '@composition/container'
import { requireSectionAccess } from '@/presentation/admin-page'
import { siteUrl } from '@/shared/config/site'
import { ContentTabs } from '@/features/admin/components/content-tabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Контент | Адмін' }

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSectionAccess(['manage_content'])

  const content = getContentUseCases()
  const [editor, seo, sp] = await Promise.all([content.getMessagesForEditor(), content.getSeo(), searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Контент сайту</h1>
        <p className="text-muted-foreground">
          Тексти сайту за сторінками й блоками (у порядку появи на сайті), приховування блоків та
          метадані (SEO). Зміни застосовуються на сайті одразу, без деплою.
        </p>
      </div>
      <ContentTabs
        initialTab={sp?.tab ?? ''}
        content={{
          initial: editor.messages,
          defaults: editor.defaults,
          baseUpdatedAt: editor.updatedAt,
        }}
        meta={{
          initial: seo.content,
          defaults: seo.defaults,
          baseUpdatedAt: seo.updatedAt,
          siteUrl,
          siteName: editor.messages.site.name,
        }}
      />
    </div>
  )
}
