import { requireSectionAccess } from '@/lib/admin-guard'
import {
  getLegalOverrides,
  mergeLegalContent,
  getLegalUpdatedAt,
} from '@/lib/legal'
import { LegalForm } from '@/components/admin/legal-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Юридичні документи | Адмін' }

export default async function LegalPage() {
  await requireSectionAccess(['manage_content'])

  const overrides = await getLegalOverrides()
  const content = mergeLegalContent(overrides)
  const updatedAt = await getLegalUpdatedAt()

  const initial = {
    privacy: { title: content.privacy.title, sections: content.privacy.sections },
    offer: { title: content.offer.title, sections: content.offer.sections },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Юридичні документи</h1>
        <p className="text-muted-foreground">
          Редагуйте «Політику конфіденційності» та «Публічну оферту». Зміни
          застосовуються на сайті одразу, без деплою. Лише простий текст — HTML не
          підтримується. «Останнє оновлення» на сторінці ставиться автоматично датою
          збереження.
        </p>
      </div>
      <LegalForm initial={initial} baseUpdatedAt={updatedAt} />
    </div>
  )
}
