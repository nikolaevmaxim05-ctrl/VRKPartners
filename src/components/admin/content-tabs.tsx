'use client'

// Підвкладки розділу «Контент»: «Контент» (редактор лендингу, без змін) і
// «Метадані (SEO)». Активна вкладка синхронізується з URL (?tab=meta), щоб
// переживати перезавантаження: початкове значення приходить із сервера
// (searchParams), зміна — пише в URL через router.replace.
//
// Контакти для read-only блоку у «Метадані» приходять із сервера, але при переході
// НА вкладку «Метадані» перечитуються (GET /api/admin/content), щоб показати свіжі
// значення одразу після правки контактів у вкладці «Контент» — без F5.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ContentForm } from '@/components/admin/content-form'
import { MetaForm } from '@/components/admin/meta-form'

type Tab = 'content' | 'meta'
type Contacts = { phone: string; email: string; telegram: string }

export function ContentTabs({
  initialTab,
  content,
  meta,
}: {
  initialTab: Tab
  content: React.ComponentProps<typeof ContentForm>
  // onGoToContacts додає сам ContentTabs; contacts — початкові (перечитуються при переході).
  meta: Omit<React.ComponentProps<typeof MetaForm>, 'onGoToContacts'>
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [contacts, setContacts] = useState<Contacts>(meta.contacts)
  const pathname = usePathname()
  const router = useRouter()

  async function refreshContacts() {
    try {
      const res = await fetch('/api/admin/content')
      if (!res.ok) return
      const json = await res.json()
      const s = json?.content?.site
      if (s && typeof s === 'object') {
        setContacts({
          phone: String(s.phone ?? ''),
          email: String(s.email ?? ''),
          telegram: String(s.telegram ?? ''),
        })
      }
    } catch {
      // не критично — лишаємо попередні значення
    }
  }

  function onChange(v: string) {
    const t: Tab = v === 'meta' ? 'meta' : 'content'
    setTab(t)
    router.replace(t === 'meta' ? `${pathname}?tab=meta` : pathname, { scroll: false })
    // Перечитуємо контакти при переході на «Метадані» (могли змінити у «Контент»).
    if (t === 'meta') void refreshContacts()
  }

  return (
    <Tabs value={tab} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="content">Контент</TabsTrigger>
        <TabsTrigger value="meta">Метадані (SEO)</TabsTrigger>
      </TabsList>
      <TabsContent value="content">
        <ContentForm {...content} />
      </TabsContent>
      <TabsContent value="meta">
        <MetaForm {...meta} contacts={contacts} onGoToContacts={() => onChange('content')} />
      </TabsContent>
    </Tabs>
  )
}
