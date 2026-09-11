// core/domain/layout/hyphen — слово з дефісом не розривається по дефісу (розділ 12, п. 9).
// Чиста частина: розбиває текст на відрізки; React-обгортку у <span class="nb"> робить
// shared/lib/nb-hyphen.tsx. Текст не змінюється ні на символ.
//
// Дефіс між літерою/цифрою і літерою/цифрою — законне місце переносу для браузера
// («веб-» / «розробку»); CSS це не лікує. Не чіпаємо: тире «—», дефіс із пробілами « - »,
// «-5», «5-», слеш.

export const HYPHENATED = /(\S*[\p{L}\p{N}]-[\p{L}\p{N}]\S*)/gu

export type HyphenPart = { text: string; nb: boolean }

/** Розбиває текст на звичайні відрізки та слова з дефісом (nb = true). Без дефісів → один відрізок. */
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
