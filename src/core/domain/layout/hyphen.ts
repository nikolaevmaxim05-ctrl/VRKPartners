// core/domain/layout/hyphen — слово с дефисом не разрывается по дефису (раздел 12, п. 9).
// Чистая часть: разбивает текст на отрезки; React-обёртку в <span class="nb"> делает
// shared/lib/nb-hyphen.tsx. Текст не меняется ни на символ.
//
// Дефис между буквой/цифрой и буквой/цифрой — законное место переноса для браузера
// («веб-» / «розробку»); CSS это не лечит. Не трогаем: тире «—», дефис с пробелами « - »,
// «-5», «5-», слеш.

export const HYPHENATED = /(\S*[\p{L}\p{N}]-[\p{L}\p{N}]\S*)/gu

export type HyphenPart = { text: string; nb: boolean }

/** Разбивает текст на обычные отрезки и слова с дефисом (nb = true). Без дефисов → один отрезок. */
export function splitHyphenated(text: string): HyphenPart[] {
  if (!text || !HYPHENATED.test(text)) {
    HYPHENATED.lastIndex = 0
    return [{ text, nb: false }]
  }
  HYPHENATED.lastIndex = 0
  const parts: HyphenPart[] = []
  let last = 0
  for (const m of text.matchAll(HYPHENATED)) {
    const start = m.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start), nb: false })
    parts.push({ text: m[0], nb: true })
    last = start + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), nb: false })
  return parts
}
