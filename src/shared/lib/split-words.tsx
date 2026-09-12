// SplitWords — текст → слова у <span data-word>, пробіли лишаються текстовими вузлами (перенос рядків
// працює як у звичайному тексті). Ставиться в розмітці (SSR): без JS і до гідрації всі слова яскраві
// (opacity не задано), textContent елемента дорівнює вихідному рядку. Розгоранням керує
// features/landing/lib/word-reveal.ts усередині контейнера [data-word-reveal].
import type { ReactNode } from 'react'
import { splitWords } from '@core/domain/layout/word-reveal'

export function SplitWords({ text }: { text: string }): ReactNode {
  const parts = splitWords(text)
  if (parts.length === 1 && parts[0].word) return <span data-word>{parts[0].text}</span>
  return parts.map((p, i) => (p.word ? <span key={i} data-word>{p.text}</span> : p.text))
}
