// core/domain/layout/fit-text — арифметика підгонки заголовків (розділ 12, п. 1). Без DOM:
// вимірювання робить features/landing/lib/fit-text.ts, тут — лише правила.

/** Нижня межа: 60 % базового розміру (floor). */
export const MIN_RATIO = 0.6

export type WidthFit =
  | { kind: 'keep' }
  | { kind: 'shrink'; size: number }
  | { kind: 'break'; size: number }

/**
 * Прохід по ширині: якщо найширший нерозривний відрізок (widest) ширший за доступне місце,
 * size = floor(base × available / widest), але не менше floor(base × 0.6). Якщо і мінімум не
 * допомагає — 'break' (клас .fit-break: overflow-wrap: anywhere). Вміщується → 'keep'
 * (inline-розмір не записуємо, лишається адаптивний clamp з CSS).
 */
export function fitWidth(base: number, available: number, widest: number): WidthFit {
  if (!(base > 0) || !(available > 0) || !(widest > 0) || widest <= available) return { kind: 'keep' }
  const min = Math.floor(base * MIN_RATIO)
  const size = Math.max(min, Math.floor((base * available) / widest))
  // Пропорційна оцінка: чи вміститься найширший відрізок при цьому розмірі.
  const fits = (widest * size) / base <= available
  return fits ? { kind: 'shrink', size } : { kind: 'break', size: min }
}

/**
 * Ряд цифр статистики вирівнюється як ряд: якщо розміри розійшлися більше ніж на 0.5px —
 * усім ставиться найменший. Повертає null, якщо вирівнювати нема чого.
 */
export function equalizeRow(sizes: number[]): number | null {
  const valid = sizes.filter((s) => Number.isFinite(s) && s > 0)
  if (valid.length < 2) return null
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  return max - min > 0.5 ? min : null
}

/**
 * Прохід по висоті (перший екран): найбільший розмір у [floor(base×0.6), base], при якому
 * ряд кнопок ще вище нижнього краю (з запасом 2px). `fits(size)` міряє DOM; бінарний пошук.
 */
export function fitHeight(base: number, fits: (size: number) => boolean): number | null {
  const min = Math.floor(base * MIN_RATIO)
  if (fits(base)) return null // вміщується на базовому — inline-розмір не пишемо
  let lo = min
  let hi = base
  if (!fits(lo)) return lo
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}
