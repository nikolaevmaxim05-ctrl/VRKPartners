'use client'

// Вкладки раздела «Контент»: страницы сайта из CONTENT_PAGES («Головна», «Наскрізне») +
// «Метадані (SEO)» (отклонение 2). Активная вкладка синхронизируется с URL (?tab=…), чтобы
// переживать перезагрузку: начальное значение приходит с сервера (searchParams),
// изменение — пишет в URL через router.replace.
//
// Редактор текстов смонтирован всегда (состояние всех страниц — один объект, одна кнопка
// сохранения); вкладка лишь говорит, какую страницу показывать. Контакты для read-only блока в
// «Метадані» берутся из состояния редактора после сохранения — без F5.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { ContentEditor } from '@/features/admin/components/content-editor'
import { MetaForm } from '@/features/admin/components/meta-form'
import { CONTENT_PAGES } from '@core/domain/content/layout'
import type { PlainObject } from '@core/domain/content/messages'

const META_TAB = 'meta'
type Contacts = { phone: string; email: string; telegram: string }

function contactsOf(messages: PlainObject): Contacts {
  const s = (messages.site ?? {}) as Record<string, unknown>
  return { phone: String(s.phone ?? ''), email: String(s.email ?? ''), telegram: String(s.telegram ?? '') }
}

export function ContentTabs({
  initialTab,
  content,
  meta,
}: {
  initialTab: string
  content: Omit<React.ComponentProps<typeof ContentEditor>, 'page' | 'onSaved'>
  // contacts и onGoToContacts добавляет сам ContentTabs.
  meta: Omit<React.ComponentProps<typeof MetaForm>, 'onGoToContacts' | 'contacts'>
}) {
  const isKnown = (t: string) => t === META_TAB || CONTENT_PAGES.some((p) => p.id === t)
  const [tab, setTab] = useState<string>(isKnown(initialTab) ? initialTab : CONTENT_PAGES[0].id)
  const [contacts, setContacts] = useState<Contacts>(() => contactsOf(content.initial))
  const pathname = usePathname()
  const router = useRouter()

  function onChange(v: string) {
    const t = isKnown(v) ? v : CONTENT_PAGES[0].id
    setTab(t)
    router.replace(t === CONTENT_PAGES[0].id ? pathname : `${pathname}?tab=${t}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={onChange}>
        <TabsList>
          {CONTENT_PAGES.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value={META_TAB}>Метадані (SEO)</TabsTrigger>
        </TabsList>
      </Tabs>
      <ContentEditor {...content} page={tab === META_TAB ? null : tab} onSaved={(m) => setContacts(contactsOf(m))} />
      <div hidden={tab !== META_TAB}>
        <MetaForm {...meta} contacts={contacts} onGoToContacts={() => onChange('global')} />
      </div>
    </div>
  )
}
