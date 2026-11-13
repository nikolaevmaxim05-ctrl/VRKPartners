// Автоувеличение скриншота кейса на мобильном — DOM-часть (шаг 5 мобильных анимаций).
// Правило и константы — @core/domain/layout/case-image-zoom.
//
// Обёртка [data-case-zoom] (вокруг картинки в карточке кейсов): геометрия (верх в документе, высота,
// ширина) кэшируется и перемеряется на resize / ResizeObserver / загрузку картинки / refresh
// (смена кейса); в scroll (passive → rAF) — только арифметика по кэшу и запись transform: scale().
// Запас по вертикали (CSS-переменная --case-zoom-reserve → margin-block обёртки) резервирует место под
// увеличенную картинку, чтобы она не наезжала на метрики сверху и «Підходи» снизу; пишется только при
// перемере. data-zoomed="1" при масштабе > 1 — для z-index/тени/will-change в CSS.
// Только при (max-width: 639.98px); за порогом и в режиме «меньше движения» — transform снят.
import { CASE_ZOOM_MAX_WIDTH, targetScale, verticalReserve, zoomScale } from '@core/domain/layout/case-image-zoom'

export type CaseImageZoomController = { refresh(): void; destroy(): void }

/** Верх элемента в документе по цепочке offsetParent (без влияния transform). */
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
    // Геометрия — через offset* (layout-значения, не зависят от текущего transform: rect
    // масштабированной обёртки соврал бы о высоте и top). Запас под увеличение — до измерения
    // позиции (меняет margin, следовательно и top).
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
      // Контент выше секции досчитывается после гидрации (шрифты, картинки) и сдвигает обёртку, не
      // меняя её размера — следим и за высотой страницы.
      ro.observe(document.body)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      // Подход к вьюпорту — перемерить ещё раз (кэш top мог устареть без изменения размеров).
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
