// core/domain/layout/word-reveal — «розгорання» слів по мірі прокрутки (крок 4 мобільних анімацій).
// Без DOM: вимірювання й запис opacity робить features/landing/lib/word-reveal.ts, тут — розбиття на
// слова, константи та арифметика прогресу.
//
// Модель: «лінія читання» — горизонталь на READING_LINE висоти вьюпорту (трохи нижче центру). Слово
// тьмяне (MIN_OPACITY), поки його рядок нижче лінії; піднімаючись до лінії на відстані BAND (частка
// висоти вьюпорту), воно лінійно розгорається до 1; у рядку ліві слова йдуть трохи раніше правих
// (IN_LINE_SPREAD — зсув «ефективної» позиції правого краю рядка вниз). Прокрутка назад — обернений
// хід (чистий скраб по позиції). Кінець сторінки: на останніх (1 − READING_LINE) × vh пікселях
// прокрутки лінія опускається до низу вьюпорту — при максимальній прокрутці яскраве все, що у вікні
// (секція може бути останньою, якщо клієнт приховав блоки нижче).

export type WordRevealParams = {
  /** Лінія читання: частка висоти вьюпорту від верху. */
  readingLine: number
  /** Прозорість слова, до якого лінія ще не дійшла (0 — невидиме; панель дозволяє 0…0.9). */
  minOpacity: number
  /** Відстань (частка vh), на якій слово проходить min → 1. */
  band: number
  /** Зсув у межах рядка (частка vh): праве слово рядка розгорається пізніше лівого. */
  spread: number
}

export const WORD_REVEAL_DEFAULTS: WordRevealParams = {
  // 0.72 — трохи нижче від центру, ближче до низу вьюпорту (уточнення власника 2026-09-12; було 0.6).
  readingLine: 0.72,
  // 0 — слово повністю невидиме, поки лінія читання до нього не дійшла (уточнення власника 2026-09-12).
  minOpacity: 0,
  band: 0.14,
  spread: 0.06,
}

/** Межі параметрів (панель налаштування, localStorage): поза межами — обрізаємо. */
export const WORD_REVEAL_RANGES: Record<keyof WordRevealParams, [number, number]> = {
  readingLine: [0.3, 0.9],
  minOpacity: [0, 0.9],
  band: [0.02, 0.5],
  spread: [0, 0.3],
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function normalizeParams(raw: Partial<Record<keyof WordRevealParams, unknown>> | null | undefined): WordRevealParams {
  const out = { ...WORD_REVEAL_DEFAULTS }
  if (!raw) return out
  for (const key of Object.keys(WORD_REVEAL_RANGES) as (keyof WordRevealParams)[]) {
    const v = Number(raw[key])
    if (!Number.isFinite(v)) continue
    const [lo, hi] = WORD_REVEAL_RANGES[key]
    out[key] = Math.min(hi, Math.max(lo, v))
  }
  return out
}

/**
 * Лінія читання у координатах вьюпорту (px від верху) з урахуванням кінця сторінки:
 * базова = readingLine × vh; на останніх tail = (1 − readingLine) × vh пікселях прокрутки лінія лінійно
 * опускається до vh. Сторінка без прокрутки (maxScroll ≤ 0) — лінія одразу внизу: яскраве все, що у вікні.
 */
export function readingLineY(
  scrollY: number,
  vh: number,
  maxScroll: number,
  readingLine = WORD_REVEAL_DEFAULTS.readingLine,
  /** Додатковий запас нижче вьюпорту в кінці сторінки (px): компенсує зсув правих слів рядка. */
  endOvershoot = 0,
): number {
  const base = readingLine * vh
  const end = vh + Math.max(0, endOvershoot)
  const tail = end - base
  if (!(tail > 0)) return end
  const remaining = Math.max(0, maxScroll) - Math.max(0, scrollY)
  const t = clamp01(1 - remaining / (vh - base > 0 ? vh - base : tail))
  return base + t * tail
}

/**
 * Прозорість слова.
 * @param wordTop верх слова в координатах документа, px
 * @param leftRatio позиція в рядку: 0 — ліве слово, 1 — праве
 * @param scrollY поточна прокрутка
 * @param vh висота вьюпорту
 * @param maxScroll максимальна прокрутка документа (scrollHeight − clientHeight)
 */
export function wordOpacity(
  wordTop: number,
  leftRatio: number,
  scrollY: number,
  vh: number,
  maxScroll: number,
  p: WordRevealParams = WORD_REVEAL_DEFAULTS,
): number {
  if (!Number.isFinite(wordTop) || !(vh > 0)) return 1
  const line = readingLineY(scrollY, vh, maxScroll, p.readingLine, p.spread * vh)
  const bandPx = Math.max(1, p.band * vh)
  const y = wordTop - scrollY + clamp01(Number.isFinite(leftRatio) ? leftRatio : 0) * p.spread * vh
  // Верх слова на лінії або вище → 1; на відстані bandPx нижче лінії → min.
  const progress = clamp01((line + bandPx - y) / bandPx)
  return p.minOpacity + (1 - p.minOpacity) * progress
}

export type WordPart = { text: string; word: boolean }

/**
 * Розбиття на слова для розмітки: пробіли зберігаються як окремі частини (текстові вузли між
 * <span>), інакше ламається перенос рядків; NBSP і дефіси лишаються всередині слова. Конкатенація
 * частин дорівнює вихідному рядку.
 */
export function splitWords(text: string): WordPart[] {
  const out: WordPart[] = []
  const re = /[ \t\r\n]+/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), word: true })
    out.push({ text: m[0], word: false })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), word: true })
  return out
}
