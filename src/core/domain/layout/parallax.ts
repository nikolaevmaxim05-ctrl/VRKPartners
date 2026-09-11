// core/domain/layout/parallax — арифметика паралакса фону лендингу. Без DOM: вимірювання та
// запис стилів робить features/landing/lib/parallax.ts, тут — лише константа й правила.
//
// Модель: контент їде на scrollY, фон — на PARALLAX_RATIO × scrollY (повільніше). Шар фону
// закріплений на вьюпорті (position: fixed), усередині — одна доріжка з плямами й сіткою, яку
// зсуваємо на −ratio × scrollY. Щоб при максимальній прокрутці S = H − vh було видно нижній
// край доріжки (нижні плями не «губилися»), її висота = ratio × S + vh.

/** Швидкість фону відносно контенту: 0.45 = фон проходить 45 % шляху контенту. Підбирається на око. */
export const PARALLAX_RATIO = 0.45

/** Шлях прокрутки сторінки: H − vh, не менше 0 (сторінка коротша за вьюпорт — прокрутки немає). */
export function scrollRange(pageHeight: number, viewportHeight: number): number {
  if (!Number.isFinite(pageHeight) || !Number.isFinite(viewportHeight)) return 0
  return Math.max(0, pageHeight - viewportHeight)
}

/**
 * Висота доріжки фону: ratio × S + vh. У кінці прокрутки доріжка зсунута на ratio × S, тож
 * видима частина — [ratio × S, ratio × S + vh] = її нижній край. Плями розкладені у % від
 * цієї висоти → рівномірно вкривають увесь шлях від першого екрана до футера.
 * vh — НАЙБІЛЬШИЙ вьюпорт (100vh на мобільних, без адресного рядка): при більшому vh
 * доріжка довша, ніж треба, а не коротша.
 */
export function trackHeight(pageHeight: number, viewportHeight: number, ratio = PARALLAX_RATIO): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0 // вьюпорт не виміряно
  return Math.ceil(ratio * scrollRange(pageHeight, viewportHeight) + viewportHeight)
}

/** Зсув доріжки для JS-фолбека (без scroll-driven animation): −ratio × scrollY. */
export function trackOffset(scrollY: number, ratio = PARALLAX_RATIO): number {
  if (!Number.isFinite(scrollY) || scrollY <= 0) return 0
  return -ratio * scrollY
}

/** Позиція плями в px від верху доріжки за її часткою (top у %). */
export function blobTop(percent: number, trackHeightPx: number): number {
  return Math.round((percent / 100) * trackHeightPx)
}
