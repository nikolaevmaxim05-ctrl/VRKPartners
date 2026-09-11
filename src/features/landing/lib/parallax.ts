// Паралакс фону лендингу — DOM-частина. Правила й константа — у @core/domain/layout/parallax.
//
// Стартовий стан (SSR, без JS, «менше руху»): шар .site-bg — absolute на всю сторінку, їде разом
// із контентом (як було). Після гідрації attachParallax() вмикає паралакс:
//   • шар отримує data-parallax="css" | "js" → стає position: fixed на вьюпорт (100vh);
//   • доріжці .site-bg-track пишеться висота ratio × S + vh, плямам — top у px (частка від
//     висоти доріжки; px, а не %, щоб CSS-transition плавно перевів їх у нові позиції);
//   • «css»: зсув доріжки рахує браузер (animation-timeline: scroll(root), поза головним потоком);
//   • «js»: passive scroll → rAF → transform однієї доріжки (translate3d).
// Висота сторінки береться з документа й переганяється на resize / ResizeObserver(body) /
// зміну маршруту (refresh). Зміна лише висоти вьюпорту (адресний рядок iOS) нічого не переписує:
// vh міряється як 100vh — найбільший вьюпорт, стабільний при згортанні рядка.
import { blobTop, trackHeight, trackOffset } from '@core/domain/layout/parallax'

export type ParallaxMode = 'css' | 'js'

export type ParallaxController = {
  /** Переміряти сторінку й перезаписати геометрію (при зміні маршруту). */
  refresh(): void
  /** Зняти слухачі й повернути стартовий стан. */
  destroy(): void
}

/** Scroll-driven animations (animation-timeline) — Chrome 115+, Safari 26+, Firefox 1xx+. */
export function supportsScrollTimeline(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()')
}

export function attachParallax(layer: HTMLElement): ParallaxController {
  const track = layer.querySelector<HTMLElement>('.site-bg-track')
  const blobs = Array.from(layer.querySelectorAll<HTMLElement>('.site-bg-blob'))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let mode: ParallaxMode | null = null
  let raf = 0
  let scrolling = false
  let lastHeight = -1

  const onScroll = () => {
    if (scrolling) return
    scrolling = true
    requestAnimationFrame(() => {
      scrolling = false
      if (track && mode === 'js') track.style.transform = `translate3d(0, ${trackOffset(window.scrollY)}px, 0)`
    })
  }

  const enable = () => {
    if (!track) return
    mode = supportsScrollTimeline() ? 'css' : 'js'
    layer.dataset.parallax = mode
    if (mode === 'js') {
      window.addEventListener('scroll', onScroll, { passive: true })
      track.style.transform = `translate3d(0, ${trackOffset(window.scrollY)}px, 0)`
    } else {
      track.style.transform = ''
    }
  }

  const disable = () => {
    window.removeEventListener('scroll', onScroll)
    delete layer.dataset.parallax
    if (track) {
      track.style.transform = ''
      track.style.height = ''
    }
    for (const b of blobs) b.style.top = ''
    mode = null
    lastHeight = -1
  }

  const measure = () => {
    if (!track || !mode) return
    // Шар у режимі паралакса — height: 100vh (найбільший вьюпорт), доріжка поза потоком:
    // ні шар, ні доріжка не впливають на висоту документа.
    const vh = layer.offsetHeight
    const pageHeight = document.documentElement.scrollHeight
    const height = trackHeight(pageHeight, vh)
    if (height <= 0) {
      // Вьюпорт ще не має розміру (перемикання емуляції, прихована вкладка) — переміряти кадром пізніше.
      scheduleRefresh()
      return
    }
    if (height === lastHeight) return
    lastHeight = height
    track.style.height = `${height}px`
    for (const b of blobs) {
      const pct = Number(b.dataset.top)
      if (Number.isFinite(pct)) b.style.top = `${blobTop(pct, height)}px`
    }
  }

  const refresh = () => {
    if (reduced.matches) {
      if (mode) disable()
      return
    }
    if (!mode) enable()
    measure()
  }

  const scheduleRefresh = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(refresh)
  }

  const onMotionChange = () => refresh()

  refresh()
  window.addEventListener('resize', scheduleRefresh)
  reduced.addEventListener('change', onMotionChange)
  // Висота сторінки змінюється без resize: довантаження шрифтів, розкриття FAQ, приховані блоки.
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRefresh) : null
  ro?.observe(document.body)

  return {
    refresh,
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', scheduleRefresh)
      reduced.removeEventListener('change', onMotionChange)
      ro?.disconnect()
      disable()
    },
  }
}
