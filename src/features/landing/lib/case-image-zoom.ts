// Автозбільшення скріншота кейсу на мобільному — DOM-частина (крок 5 мобільних анімацій).
// Правило й константи — @core/domain/layout/case-image-zoom.
//
// Обгортка [data-case-zoom] (навколо картинки в картці кейсів): геометрія (верх у документі, висота,
// ширина) кешується й переміряється на resize / ResizeObserver / завантаження картинки / refresh
// (зміна кейсу); у scroll (passive → rAF) — лише арифметика по кешу і запис transform: scale().
// Запас по вертикалі (CSS-змінна --case-zoom-reserve → margin-block обгортки) резервує місце під
// збільшену картинку, щоб вона не наїжджала на метрики зверху і «Підходи» знизу; пишеться лише при
// перемірі. data-zoomed="1" при масштабі > 1 — для z-index/тіні/will-change у CSS.
// Лише при (max-width: 639.98px); за порогом і в режимі «менше руху» — transform знято.
import { CASE_ZOOM_MAX_WIDTH, targetScale, verticalReserve, zoomScale } from '@core/domain/layout/case-image-zoom'

export type CaseImageZoomController = { refresh(): void; destroy(): void }

/** Верх елемента в документі за ланцюжком offsetParent (без впливу transform). */
function offsetTopInPage(el: HTMLElement): number {
  let top = 0
  let cur: HTMLElement | null = el
  while (cur) {
    top += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return top
}

const MEDIA = `(max-width: ${CASE_ZOOM_MAX_WIDTH - 0.02}px)`
const REDUCED = '(prefers-reduced-motion: reduce)'
const EPS = 0.002

export function attachCaseImageZoom(wrapper: HTMLElement): CaseImageZoomController {
  const mq = window.matchMedia(MEDIA)
  const reduced = window.matchMedia(REDUCED)
  let top = 0
  let height = 0
  let width = 0
  let last = 1
  let raf = 0
  let measureRaf = 0
  let active = false

  const write = (scale: number) => {
    if (Math.abs(scale - last) < EPS && !(scale === 1 && last !== 1)) return
    last = scale
    if (scale <= 1) {
      wrapper.style.transform = ''
      wrapper.dataset.zoomed = '0'
    } else {
      wrapper.style.transform = `scale(${Math.round(scale * 1000) / 1000})`
      wrapper.dataset.zoomed = '1'
    }
  }

  const apply = () => {
    raf = 0
    if (!active || !(height > 0)) return
    const centerY = top + height / 2 - window.scrollY
    write(zoomScale(centerY, window.innerHeight, window.innerWidth, width))
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  const measure = () => {
    measureRaf = 0
    if (!active) return
    // Геометрія — через offset* (layout-значення, не залежать від поточного transform: rect
    // масштабованої обгортки збрехав би про висоту й top). Запас під збільшення — до вимірювання
    // позиції (змінює margin, отже й top).
    const w0 = wrapper.offsetWidth
    const h0 = wrapper.offsetHeight
    const s = targetScale(window.innerWidth, w0)
    wrapper.style.setProperty('--case-zoom-reserve', `${Math.ceil(verticalReserve(s, h0))}px`)
    top = offsetTopInPage(wrapper)
    height = wrapper.offsetHeight
    width = wrapper.offsetWidth
    last = NaN
    apply()
  }
  const scheduleMeasure = () => {
    if (!measureRaf) measureRaf = requestAnimationFrame(measure)
  }

  let ro: ResizeObserver | null = null
  let io: IntersectionObserver | null = null
  const img = wrapper.querySelector('img')
  const onLoad = () => scheduleMeasure()

  const enable = () => {
    if (active) return
    active = true
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleMeasure)
      ro.observe(wrapper)
      // Контент вище секції досчитується після гідрації (шрифти, картинки) і зсуває обгортку, не
      // змінюючи її розміру — стежимо й за висотою сторінки.
      ro.observe(document.body)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      // Підхід до вьюпорту — переміряти ще раз (кеш top міг застаріти без зміни розмірів).
      io = new IntersectionObserver((list) => list.some((e) => e.isIntersecting) && scheduleMeasure(), { rootMargin: '100% 0px' })
      io.observe(wrapper)
    }
    if ('fonts' in document) document.fonts.ready.then(scheduleMeasure).catch(() => {})
    img?.addEventListener('load', onLoad)
    measure()
  }

  const disable = () => {
    if (!active) return
    active = false
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', scheduleMeasure)
    ro?.disconnect()
    ro = null
    io?.disconnect()
    io = null
    img?.removeEventListener('load', onLoad)
    cancelAnimationFrame(raf)
    cancelAnimationFrame(measureRaf)
    raf = 0
    measureRaf = 0
    wrapper.style.transform = ''
    wrapper.style.removeProperty('--case-zoom-reserve')
    wrapper.dataset.zoomed = '0'
    last = 1
  }

  const sync = () => {
    if (reduced.matches || !mq.matches) disable()
    else enable()
  }

  mq.addEventListener?.('change', sync)
  reduced.addEventListener?.('change', sync)
  sync()

  return {
    refresh() {
      if (active) scheduleMeasure()
      else sync()
    },
    destroy() {
      mq.removeEventListener?.('change', sync)
      reduced.removeEventListener?.('change', sync)
      disable()
    },
  }
}
