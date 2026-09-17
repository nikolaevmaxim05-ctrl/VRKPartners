// Виїзд пунктів зліва по мірі прокрутки — DOM-частина (блок «Що ви отримуєте?», 2026-09-17).
// Правило й константи — @core/domain/layout/slide-in.
//
// Пункт [data-slide-in] (li) з частинами [data-slide-part="0|1|2"] (номер, жовта фраза, сіра
// частина). Верх кожного пункту в документі міряється ОДИН раз і кешується (offsetTop по ланцюжку
// offsetParent — transform частин на нього не впливає); перемір — resize, document.fonts.ready,
// ResizeObserver батька пунктів (ol) і body (контент вище досчитується після гідрації і зсуває блок,
// не змінюючи його розміру), зміна маршруту (refresh). У scroll (passive → rAF) — лише арифметика по
// кешу і запис transform/opacity на частинах, коли значення змінилося помітно. Поки батько пунктів
// далеко від вьюпорту (IntersectionObserver-гейт із запасом 50 % vh), кадр пропускається; на
// вході/виході з гейта стан дораховується один раз (швидка прокрутка «наскрізь» не лишає застарілих
// значень) і вмикається/знімається will-change: transform. «Менше руху» — ефект вимкнено: інлайн-стилі
// й клас html.js-slide-in знято, слухачі не вішаються; на зміну налаштування реагуємо через
// matchMedia change.
import {
  SLIDE_IN_DEFAULTS,
  itemProgress,
  partProgress,
  partState,
  slideDistance,
  type SlideInParams,
} from '@core/domain/layout/slide-in'

type Part = { el: HTMLElement; index: number; lastX: number; lastO: number }
type Item = { el: HTMLElement; gate: HTMLElement; top: number; parts: Part[] }

export type SlideInController = {
  /** Перезібрати пункти (зміна маршруту/контенту), переміряти й перерахувати. */
  refresh(): void
  /** Замінити параметри й перерахувати (підбір значень на превʼю). */
  setParams(p: SlideInParams): void
  destroy(): void
}

const REDUCED = '(prefers-reduced-motion: reduce)'
/** Клас на <html>: частини приховані й зсунуті CSS до першого розрахунку (ставить інлайн-скрипт layout). */
const HTML_CLASS = 'js-slide-in'
/** Запас гейта: батько пунктів вважається «поруч» за 50 % висоти вікна від краю. */
const GATE_MARGIN = '50% 0px 50% 0px'
const EPS_X = 0.5
const EPS_O = 0.01

/** Верх елемента в документі за ланцюжком offsetParent (без впливу transform нащадків). */
function offsetTopInPage(el: HTMLElement): number {
  let top = 0
  let cur: HTMLElement | null = el
  while (cur) {
    top += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return top
}

export function attachSlideIn(root: ParentNode = document, initial: SlideInParams = SLIDE_IN_DEFAULTS): SlideInController {
  let params = initial
  const reduced = window.matchMedia(REDUCED)
  let items: Item[] = []
  let gates: HTMLElement[] = []
  const near = new Set<HTMLElement>()
  let io: IntersectionObserver | null = null
  let ro: ResizeObserver | null = null
  let raf = 0
  let forceRaf = 0
  let measureRaf = 0
  let active = false

  const write = (part: Part, x: number, opacity: number) => {
    const xr = Math.round(x * 10) / 10
    const o = opacity >= 0.995 ? 1 : Math.round(opacity * 1000) / 1000
    if (Math.abs(xr - part.lastX) < EPS_X && Math.abs(o - part.lastO) < EPS_O && !(o === 1 && part.lastO !== 1)) return
    part.lastX = xr
    part.lastO = o
    // Явні значення (не порожній рядок): до гідрації клас html.js-slide-in тримає частини прихованими.
    part.el.style.transform = xr === 0 || o === 1 ? 'none' : `translate3d(${xr}px, 0, 0)`
    part.el.style.opacity = String(o)
  }

  const clear = () => {
    for (const it of items)
      for (const p of it.parts) {
        p.el.style.transform = ''
        p.el.style.opacity = ''
        p.el.style.willChange = ''
        p.lastX = NaN
        p.lastO = NaN
      }
  }

  const compute = (all: boolean) => {
    if (!active || items.length === 0) return
    if (!all && near.size === 0) return
    const scrollY = window.scrollY
    const vh = window.innerHeight
    const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight
    const distance = slideDistance(window.innerWidth, params)
    for (const it of items) {
      if (!all && !near.has(it.gate)) continue
      const ip = itemProgress(it.top, scrollY, vh, maxScroll, params)
      for (const p of it.parts) {
        const s = partState(partProgress(ip, p.index, params), distance)
        write(p, s.x, s.opacity)
      }
    }
  }

  const apply = () => {
    raf = 0
    compute(false)
  }
  const applyAll = () => {
    forceRaf = 0
    compute(true)
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }
  const scheduleAll = () => {
    if (!forceRaf) forceRaf = requestAnimationFrame(applyAll)
  }

  const measure = () => {
    measureRaf = 0
    if (!active) return
    for (const it of items) {
      it.top = offsetTopInPage(it.el)
      for (const p of it.parts) {
        p.lastX = NaN
        p.lastO = NaN
      }
    }
    compute(true)
  }
  const scheduleMeasure = () => {
    if (!measureRaf) measureRaf = requestAnimationFrame(measure)
  }

  const setWillChange = (gate: HTMLElement, on: boolean) => {
    for (const it of items) {
      if (it.gate !== gate) continue
      for (const p of it.parts) p.el.style.willChange = on ? 'transform' : ''
    }
  }

  const collect = () => {
    items = []
    const seen = new Set<HTMLElement>()
    root.querySelectorAll<HTMLElement>('[data-slide-in]').forEach((el) => {
      const parts: Part[] = []
      el.querySelectorAll<HTMLElement>('[data-slide-part]').forEach((pe) => {
        const index = Number(pe.dataset.slidePart)
        parts.push({ el: pe, index: Number.isFinite(index) ? index : 0, lastX: NaN, lastO: NaN })
      })
      if (parts.length === 0) return
      const gate = el.parentElement ?? el
      seen.add(gate)
      items.push({ el, gate, top: 0, parts })
    })
    gates = Array.from(seen)
  }

  const enable = () => {
    if (active) return
    active = true
    // Клас «до гідрації» (інлайн-скрипт у layout) — тримаємо, поки ефект активний.
    document.documentElement.classList.add(HTML_CLASS)
    collect()
    near.clear()
    io?.disconnect()
    ro?.disconnect()
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (list) => {
          for (const en of list) {
            const g = en.target as HTMLElement
            if (en.isIntersecting) near.add(g)
            else near.delete(g)
            setWillChange(g, en.isIntersecting)
          }
          // Вхід/вихід із гейта — один повний прохід: стан пунктів поза гейтом теж має бути актуальним.
          scheduleAll()
        },
        { rootMargin: GATE_MARGIN },
      )
      gates.forEach((g) => io!.observe(g))
    } else {
      gates.forEach((g) => near.add(g))
    }
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleMeasure)
      gates.forEach((g) => ro!.observe(g))
      ro.observe(document.body)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    if ('fonts' in document) document.fonts.ready.then(scheduleMeasure).catch(() => {})
    measure()
  }

  const disable = () => {
    if (!active) return
    active = false
    document.documentElement.classList.remove(HTML_CLASS)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', scheduleMeasure)
    io?.disconnect()
    ro?.disconnect()
    io = null
    ro = null
    cancelAnimationFrame(raf)
    cancelAnimationFrame(forceRaf)
    cancelAnimationFrame(measureRaf)
    raf = 0
    forceRaf = 0
    measureRaf = 0
    clear()
    items = []
    gates = []
    near.clear()
  }

  const sync = () => {
    if (reduced.matches) disable()
    else enable()
  }

  reduced.addEventListener('change', sync)
  sync()

  return {
    refresh() {
      if (reduced.matches) return
      disable()
      enable()
    },
    setParams(p) {
      params = p
      for (const it of items)
        for (const part of it.parts) {
          part.lastX = NaN
          part.lastO = NaN
        }
      scheduleAll()
    },
    destroy() {
      reduced.removeEventListener('change', sync)
      disable()
    },
  }
}
