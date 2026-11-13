// core/domain/layout/word-reveal — «разгорание» слов по мере прокрутки (шаг 4 мобильных анимаций).
// Без DOM: измерение и запись opacity делает features/landing/lib/word-reveal.ts, здесь — разбиение на
// слова, константы и арифметика прогресса.
//
// Модель: «линия чтения» — горизонталь на READING_LINE высоты вьюпорта (чуть ниже центра). Слово
// тусклое (MIN_OPACITY), пока его строка ниже линии; поднимаясь к линии на расстоянии BAND (доля
// высоты вьюпорта), оно линейно разгорается до 1; в строке левые слова идут чуть раньше правых
// (IN_LINE_SPREAD — сдвиг «эффективной» позиции правого края строки вниз). Прокрутка назад — обратный
// ход (чистый скраб по позиции). Конец страницы: на последних (1 − READING_LINE) × vh пикселях
// прокрутки линия опускается до низа вьюпорта — при максимальной прокрутке яркое всё, что в окне
// (секция может быть последней, если клиент скрыл блоки ниже).

export type WordRevealParams = {
  /** Линия чтения: доля высоты вьюпорта от верха. */
  readingLine: number
  /** Прозрачность слова, до которого линия ещё не дошла (0 — невидимое; панель допускает 0…0.9). */
  minOpacity: number
  /** Расстояние (доля vh), на котором слово проходит min → 1. */
  band: number
  /** Сдвиг в пределах строки (доля vh): правое слово строки разгорается позже левого. */
  spread: number
}

export const WORD_REVEAL_DEFAULTS: WordRevealParams = {
  // 0.72 — чуть ниже центра, ближе к низу вьюпорта (уточнение владельца 2026-09-12; было 0.6).
  readingLine: 0.72,
  // 0 — слово полностью невидимо, пока линия чтения до него не дошла (уточнение владельца 2026-09-12).
  minOpacity: 0,
  band: 0.14,
  spread: 0.06,
}

/** Границы параметров (панель настройки, localStorage): вне границ — обрезаем. */
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
 * Линия чтения в координатах вьюпорта (px от верха) с учётом конца страницы:
 * базовая = readingLine × vh; на последних tail = (1 − readingLine) × vh пикселях прокрутки линия линейно
 * опускается до vh. Страница без прокрутки (maxScroll ≤ 0) — линия сразу внизу: яркое всё, что в окне.
 */
export function readingLineY(
  scrollY: number,
  vh: number,
  maxScroll: number,
  readingLine = WORD_REVEAL_DEFAULTS.readingLine,
  /** Дополнительный запас ниже вьюпорта в конце страницы (px): компенсирует сдвиг правых слов строки. */
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
 * Прозрачность слова.
 * @param wordTop верх слова в координатах документа, px
 * @param leftRatio позиция в строке: 0 — левое слово, 1 — правое
 * @param scrollY текущая прокрутка
 * @param vh высота вьюпорта
 * @param maxScroll максимальная прокрутка документа (scrollHeight − clientHeight)
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
  // Верх слова на линии или выше → 1; на расстоянии bandPx ниже линии → min.
  const progress = clamp01((line + bandPx - y) / bandPx)
  return p.minOpacity + (1 - p.minOpacity) * progress
}

export type WordPart = { text: string; word: boolean }

/**
 * Разбиение на слова для разметки: пробелы сохраняются как отдельные части (текстовые узлы между
 * <span>), иначе ломается перенос строк; NBSP и дефисы остаются внутри слова. Конкатенация
 * частей равна исходной строке.
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
