// nbHyphen — слово с дефисом → <span class="nb">…</span> (раздел 12, п. 9).
// Ставится в разметке (SSR) во всех подгоняемых заголовках — заголовок первого экрана является
// LCP-элементом, обёртку нельзя добавлять после загрузки. Без дефиса возвращает ту же
// строку (без лишних узлов). CSS: .nb { white-space: nowrap }; .fit-break .nb { white-space: normal }.
import type { ReactNode } from 'react'
import { splitHyphenated } from '@core/domain/layout/hyphen'

export function nbHyphen(text: string): ReactNode {
  const parts = splitHyphenated(text)
  if (parts.length === 1 && !parts[0].nb) return text
  return parts.map((p, i) => (p.nb ? <span key={i} className="nb">{p.text}</span> : p.text))
}
