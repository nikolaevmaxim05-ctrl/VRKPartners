// SplitWords — текст → слова в <span data-word>, пробелы остаются текстовыми узлами (перенос строк
// работает как в обычном тексте). Ставится в разметке (SSR): без JS и до гидрации все слова яркие
// (opacity не задан), textContent элемента равен исходной строке. Разгоранием управляет
// features/landing/lib/word-reveal.ts внутри контейнера [data-word-reveal].
import type { ReactNode } from 'react'
import { splitWords } from '@core/domain/layout/word-reveal'

export function SplitWords({ text }: { text: string }): ReactNode {
  const parts = splitWords(text)
  if (parts.length === 1 && parts[0].word) return <span data-word>{parts[0].text}</span>
  return parts.map((p, i) => (p.word ? <span key={i} data-word>{p.text}</span> : p.text))
}
