'use client'

// Провайдер контенту лендингу: сервер (marketing/layout) читає оверрайди з БД,
// мержить із дефолтами config/site.ts і передає готовий контент сюди пропсом.
// Клієнтські секції читають через useContent(). Якщо провайдера немає —
// useContent повертає чисті дефолти (нічого не ламається).

import * as React from 'react'
import {
  getDefaultLandingContent,
  type LandingContent,
} from '@/lib/content'

const ContentContext = React.createContext<LandingContent | null>(null)

export function ContentProvider({
  content,
  children,
}: {
  content: LandingContent
  children: React.ReactNode
}) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
}

/** Готовий (уже змержений) контент лендингу. Поза провайдером — дефолти. */
export function useContent(): LandingContent {
  const ctx = React.useContext(ContentContext)
  // useMemo, щоб дефолтний обʼєкт не перестворювався щоразу поза провайдером
  const fallback = React.useMemo(() => getDefaultLandingContent(), [])
  return ctx ?? fallback
}
