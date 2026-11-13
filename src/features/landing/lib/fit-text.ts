// Подгонка заголовков по ширине и высоте (раздел 12, п. 1) — DOM-часть.
// Элементы: [data-fit] (h1, заголовки секций, заголовок финального баннера, большие цифры статистики);
// ряд цифр: [data-fit-row="<имя>"] — после подгонки всем ставится наименьший размер.
// Правила (арифметика) — в @core/domain/layout/fit-text; здесь только измерение.
import { fitWidth, fitHeight, equalizeRow } from '@core/domain/layout/fit-text'

/** Исходный inline font-size каждого элемента — запоминаем ОДИН раз (не затираем). */
const originalInline = new WeakMap<HTMLElement, string>()
const baseSize = new WeakMap<HTMLElement, number>()

function rememberBase(el: HTMLElement): number {
  if (!originalInline.has(el)) originalInline.set(el, el.style.fontSize)
  // Возвращаем исходный размер (из CSS/clamp) и меряем от него.
  el.style.fontSize = originalInline.get(el) ?? ''
  el.classList.remove('fit-break')
  const base = parseFloat(getComputedStyle(el).fontSize)
  baseSize.set(el, base)
  return base
}

/**
 * Ширина самого длинного неразрывного отрезка: Range по текстовым узлам; слова делятся только
 * пробелами; соседние inline-узлы в одном блоке склеиваются (между блоками перенос возможен всегда).
 * Измеряем ширину каждого слова отдельным Range и берём max (слово может включать несколько
 * inline-узлов — напр. часть до и после <span class="nb">).
 */
function widestSegment(el: HTMLElement): number {
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  // Собираем последовательность (узел, индекс) символов без пробелов — сегмент рвётся на пробеле
  // или на границе блочного элемента.
  type Pos = { node: Text; offset: number }
  let segStart: Pos | null = null
  let segEnd: Pos | null = null
  let max = 0
  const range = doc.createRange()
  const flush = () => {
    if (segStart && segEnd) {
      range.setStart(segStart.node, segStart.offset)
      range.setEnd(segEnd.node, segEnd.offset)
      const w = range.getBoundingClientRect().width
      if (w > max) max = w
    }
    segStart = null
    segEnd = null
  }
  let prevBlock: Node | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const block = blockAncestor(node, el)
    if (block !== prevBlock) {
      flush()
      prevBlock = block
    }
    const text = node.data
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) {
        flush()
      } else {
        if (!segStart) segStart = { node, offset: i }
        segEnd = { node, offset: i + 1 }
      }
    }
  }
  flush()
  return max
}

function blockAncestor(node: Node, root: HTMLElement): Node {
  let cur: Node | null = node.parentNode
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && getComputedStyle(cur).display !== 'inline') return cur
    cur = cur.parentNode
  }
  return root
}

/** Проход по ширине для одного элемента. Возвращает применённый размер (или базовый). */
export function fitElementWidth(el: HTMLElement): number {
  const base = rememberBase(el)
  const parent = el.parentElement
  const available = Math.min(el.clientWidth || Infinity, parent?.clientWidth ?? Infinity)
  if (!Number.isFinite(available) || available <= 0) return base
  const widest = widestSegment(el)
  const fit = fitWidth(base, available, widest)
  if (fit.kind === 'keep') return base
  el.style.fontSize = `${fit.size}px`
  if (fit.kind === 'break') el.classList.add('fit-break')
  return fit.size
}

/**
 * Проход по высоте первого экрана: кнопки ([data-fit-buttons]) должны быть выше нижнего края
 * окна (запас 2px). Позиции — через offsetTop/offsetHeight (анимация появления сдвигает блок
 * translateY, getBoundingClientRect врёт на величину сдвига).
 */
export function fitHeroHeight(title: HTMLElement, buttons: HTMLElement): void {
  const base = baseSize.get(title) ?? parseFloat(getComputedStyle(title).fontSize)
  const current = parseFloat(getComputedStyle(title).fontSize)
  const viewport = window.innerHeight
  const fits = (size: number) => {
    title.style.fontSize = `${size}px`
    const bottom = offsetTopInPage(buttons) + buttons.offsetHeight
    return bottom + 2 <= viewport
  }
  const result = fitHeight(Math.min(base, current), fits)
  if (result === null) title.style.fontSize = current === base ? (originalInline.get(title) ?? '') : `${current}px`
  else title.style.fontSize = `${Math.min(result, current)}px`
}

function offsetTopInPage(el: HTMLElement): number {
  let top = 0
  let cur: HTMLElement | null = el
  while (cur) {
    top += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return top
}

/** Полный проход по документу: ширина для всех [data-fit], ряды [data-fit-row], высота hero. */
export function fitAll(root: ParentNode = document): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-fit]'))
  const rows = new Map<string, { el: HTMLElement; size: number }[]>()
  for (const el of els) {
    const size = fitElementWidth(el)
    const row = el.dataset.fitRow
    if (row) {
      if (!rows.has(row)) rows.set(row, [])
      rows.get(row)!.push({ el, size })
    }
  }
  for (const items of rows.values()) {
    const min = equalizeRow(items.map((i) => i.size))
    if (min !== null) for (const { el } of items) el.style.fontSize = `${min}px`
  }
  const heroTitle = root.querySelector<HTMLElement>('[data-fit="hero"]')
  const heroButtons = root.querySelector<HTMLElement>('[data-fit-buttons]')
  if (heroTitle && heroButtons) fitHeroHeight(heroTitle, heroButtons)
}
