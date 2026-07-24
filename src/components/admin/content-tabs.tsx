'use client'

// Підвкладки розділу «Контент»: «Контент» (редактор лендингу, без змін) і
// «Метадані (SEO)». Активна вкладка синхронізується з URL (?tab=meta), щоб
// переживати перезавантаження: початкове значення приходить із сервера
// (searchParams), зміна — пише в URL через router.replace.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ContentForm } from '@/components/admin/content-form'
import { MetaForm } from '@/components/admin/meta-form'

type Tab = 'content' | 'meta'

export function ContentTabs({
  initialTab,
  content,
  meta,
}: {
  initialTab: Tab
  content: React.ComponentProps<typeof ContentForm>
  meta: React.ComponentProps<typeof MetaForm>
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const pathname = usePathname()
  const router = useRouter()

  function onChange(v: string) {
    const t: Tab = v === 'meta' ? 'meta' : 'content'
    setTab(t)
    router.replace(t === 'meta' ? `${pathname}?tab=meta` : pathname, { scroll: false })
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
        <MetaForm {...meta} />
      </TabsContent>
    </Tabs>
  )
}
