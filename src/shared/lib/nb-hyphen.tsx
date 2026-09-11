// nbHyphen — слово з дефісом → <span class="nb">…</span> (розділ 12, п. 9).
// Ставиться в розмітці (SSR) у всіх підгоняних заголовках — заголовок першого екрана є
// LCP-елементом, обгортку не можна додавати після завантаження. Без дефіса повертає той самий
// рядок (без зайвих вузлів). CSS: .nb { white-space: nowrap }; .fit-break .nb { white-space: normal }.
import type { ReactNode } from 'react'
import { splitHyphenated } from '@core/domain/layout/hyphen'

export function nbHyphen(text: string): ReactNode {
  const parts = splitHyphenated(text)
  if (parts.length === 1 && !parts[0].nb) return text
  return parts.map((p, i) => (p.nb ? <span key={i} className="nb">{p.text}</span> : p.text))
}
