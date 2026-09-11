// Підгонка заголовків до ширини та висоти (розділ 12, п. 1) — DOM-частина.
// Елементи: [data-fit] (h1, заголовки секцій, заголовок фінального банера, великі цифри статистики);
// ряд цифр: [data-fit-row="<імʼя>"] — після підгонки всім ставиться найменший розмір.
// Правила (арифметика) — у @core/domain/layout/fit-text; тут лише вимірювання.
import { fitWidth, fitHeight, equalizeRow } from '@core/domain/layout/fit-text'

/** Початковий inline font-size кожного елемента — запамʼятовуємо ОДИН раз (не затираємо). */
const originalInline = new WeakMap<HTMLElement, string>()
const baseSize = new WeakMap<HTMLElement, number>()

function rememberBase(el: HTMLElement): number {
  if (!originalInline.has(el)) originalInline.set(el, el.style.fontSize)
  // Повертаємо початковий розмір (з CSS/clamp) і міряємо від нього.
  el.style.fontSize = originalInline.get(el) ?? ''
  el.classList.remove('fit-break')
  const base = parseFloat(getComputedStyle(el).fontSize)
  baseSize.set(el, base)
  return base
}

/**
 * Ширина найдовшого нерозривного відрізка: Range по текстових вузлах; слова діляться лише
 * пробілами; сусідні inline-вузли в одному блоці склеюються (між блоками перенос можливий завжди).
 * Вимірюємо ширину кожного слова окремим Range і беремо max (слово може включати кілька
 * inline-вузлів — напр. частину до і після <span class="nb">).
 */
function widestSegment(el: HTMLElement): number {
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  // Збираємо послідовність (вузол, індекс) символів без пробілів — сегмент рветься на пробілі
  // або на межі блокового елемента.
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

/** Прохід по ширині для одного елемента. Повертає застосований розмір (або базовий). */
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
 * Прохід по висоті першого екрана: кнопки ([data-fit-buttons]) мають бути вище нижнього краю
 * вікна (запас 2px). Позиції — через offsetTop/offsetHeight (анімація появи зсуває блок
 * translateY, getBoundingClientRect бреше на величину зсуву).
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

/** Повний прохід по документу: ширина для всіх [data-fit], ряди [data-fit-row], висота hero. */
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
