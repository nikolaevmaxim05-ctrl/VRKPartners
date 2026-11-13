// Разгорание слов по мере прокрутки — DOM-часть (шаг 4 мобильных анимаций). Правило и
// константы — @core/domain/layout/word-reveal; разметка — shared/lib/split-words.tsx.
//
// Контейнер [data-word-reveal] (напр. сетка карточек Audit): все его [data-word] получают opacity по
// позиции относительно линии чтения. Позиции слов (верх в документе, доля left в строке) меряются
// ОДИН раз и кэшируются; перемер — resize, document.fonts.ready, ResizeObserver контейнера, смена
// маршрута (refresh). В scroll (passive → rAF) — только арифметика по кэшу и запись style.opacity,
// когда значение изменилось заметно (≥ 0.02). Пока контейнер далеко от вьюпорта
// (IntersectionObserver-гейт с запасом), кадр пропускается. Галочка пункта ([data-word-check] в
// том же li) получает opacity первого слова. «Меньше движения» — эффект выключен: инлайн-стили сняты,
// слушатели не вешаются; на смену настройки реагируем через matchMedia change.
import { WORD_REVEAL_DEFAULTS, wordOpacity, type WordRevealParams } from '@core/domain/layout/word-reveal'

type Entry = { el: HTMLElement; check: HTMLElement | null; top: number; leftRatio: number; last: number }

export type WordRevealController = {
  /** Перемерить все контейнеры (смена маршрута/контента) и пересчитать. */
  refresh(): void
  /** Заменить параметры (панель настройки) и пересчитать. */
  setParams(p: WordRevealParams): void
  destroy(): void
}

const REDUCED = '(prefers-reduced-motion: reduce)'
/** Класс на <html>: слова в контейнерах скрыты CSS до первого расчёта (ставит инлайн-скрипт layout). */
const HTML_CLASS = 'js-word-reveal'
/** Запас гейта: контейнер считается «рядом» за 50 % высоты окна от края. */
const GATE_MARGIN = '50% 0px 50% 0px'
const EPS = 0.02

export function attachWordReveal(root: ParentNode = document, initial: WordRevealParams = WORD_REVEAL_DEFAULTS): WordRevealController {
  let params = initial
  const reduced = window.matchMedia(REDUCED)
  let containers: HTMLElement[] = []
  let entries: Entry[] = []
  const near = new Set<HTMLElement>()
  let io: IntersectionObserver | null = null
  let ro: ResizeObserver | null = null
  let raf = 0
  let measureRaf = 0
  let active = false

  const write = (e: Entry, value: number) => {
    if (Math.abs(value - e.last) < EPS && !(value === 1 && e.last !== 1)) return
    e.last = value
    // Явная «1» (не пустая строка): до гидрации класс html.js-word-reveal держит слова на opacity 0.
    const v = value >= 1 ? '1' : String(Math.round(value * 1000) / 1000)
    e.el.style.opacity = v
    if (e.check) e.check.style.opacity = v
  }

  const clear = () => {
    for (const e of entries) {
      e.el.style.opacity = ''
      if (e.check) e.check.style.opacity = ''
      e.last = 1
    }
  }

  const apply = () => {
    raf = 0
    if (!active || entries.length === 0) return
    if (near.size === 0) return
    const scrollY = window.scrollY
    const vh = window.innerHeight
    const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight
    for (const e of entries) write(e, wordOpacity(e.top, e.leftRatio, scrollY, vh, maxScroll, params))
  }

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  const measure = () => {
    measureRaf = 0
    if (!active) return
    const scrollY = window.scrollY
    const next: Entry[] = []
    const prevByEl = new Map(entries.map((e) => [e.el, e]))
    for (const c of containers) {
      const lis = new Map<Element, HTMLElement | null>()
      c.querySelectorAll<HTMLElement>('[data-word]').forEach((el) => {
        const r = el.getBoundingClientRect()
        const line = el.parentElement
        const lr = line ? line.getBoundingClientRect() : r
        const span = Math.max(1, lr.width - r.width)
        const leftRatio = Math.min(1, Math.max(0, (r.left - lr.left) / span))
        // Галочка — первому слову пункта (li с [data-word-check]).
        const li = el.closest('li')
        let check: HTMLElement | null = null
        if (li && !lis.has(li)) {
          check = li.querySelector<HTMLElement>('[data-word-check]')
          lis.set(li, check)
        }
        next.push({ el, check, top: r.top + scrollY, leftRatio, last: prevByEl.get(el)?.last ?? 1 })
      })
    }
    entries = next
    // Кэшированные last могут не совпадать с инлайн-стилем после перемера — принудительный пересчёт.
    for (const e of entries) e.last = NaN
    apply()
  }

  const scheduleMeasure = () => {
    if (!measureRaf) measureRaf = requestAnimationFrame(measure)
  }

  const enable = () => {
    if (active) return
    active = true
    // Класс «до гидрации» (инлайн-скрипт в layout) — держим, пока эффект активен; новые слова после
    // клиентской навигации тоже стартуют скрытыми до первого расчёта.
    document.documentElement.classList.add(HTML_CLASS)
    containers = Array.from(root.querySelectorAll<HTMLElement>('[data-word-reveal]'))
    near.clear()
    io?.disconnect()
    ro?.disconnect()
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (list) => {
          for (const en of list) {
            if (en.isIntersecting) near.add(en.target as HTMLElement)
            else near.delete(en.target as HTMLElement)
          }
          schedule()
        },
        { rootMargin: GATE_MARGIN },
      )
      containers.forEach((c) => io!.observe(c))
    } else {
      containers.forEach((c) => near.add(c))
    }
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleMeasure)
      containers.forEach((c) => ro!.observe(c))
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
    cancelAnimationFrame(measureRaf)
    raf = 0
    measureRaf = 0
    clear()
    entries = []
    containers = []
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
      for (const e of entries) e.last = NaN
      schedule()
    },
    destroy() {
      reduced.removeEventListener('change', sync)
      disable()
    },
  }
}
