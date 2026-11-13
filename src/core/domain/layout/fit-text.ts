// core/domain/layout/fit-text — арифметика подгонки заголовков (раздел 12, п. 1). Без DOM:
// измерение делает features/landing/lib/fit-text.ts, здесь — только правила.

/** Нижняя граница: 60 % базового размера (floor). */
export const MIN_RATIO = 0.6

export type WidthFit =
  | { kind: 'keep' }
  | { kind: 'shrink'; size: number }
  | { kind: 'break'; size: number }

/**
 * Проход по ширине: если самый широкий неразрывный отрезок (widest) шире доступного места,
 * size = floor(base × available / widest), но не меньше floor(base × 0.6). Если и минимум не
 * помогает — 'break' (класс .fit-break: overflow-wrap: anywhere). Помещается → 'keep'
 * (inline-размер не записываем, остаётся адаптивный clamp из CSS).
 */
export function fitWidth(base: number, available: number, widest: number): WidthFit {
  if (!(base > 0) || !(available > 0) || !(widest > 0) || widest <= available) return { kind: 'keep' }
  const min = Math.floor(base * MIN_RATIO)
  const size = Math.max(min, Math.floor((base * available) / widest))
  // Пропорциональная оценка: поместится ли самый широкий отрезок при этом размере.
  const fits = (widest * size) / base <= available
  return fits ? { kind: 'shrink', size } : { kind: 'break', size: min }
}

/**
 * Ряд цифр статистики выравнивается как ряд: если размеры разошлись больше чем на 0.5px —
 * всем ставится наименьший. Возвращает null, если выравнивать нечего.
 */
export function equalizeRow(sizes: number[]): number | null {
  const valid = sizes.filter((s) => Number.isFinite(s) && s > 0)
  if (valid.length < 2) return null
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  return max - min > 0.5 ? min : null
}

/**
 * Проход по высоте (первый экран): наибольший размер в [floor(base×0.6), base], при котором
 * ряд кнопок ещё выше нижнего края (с запасом 2px). `fits(size)` меряет DOM; бинарный поиск.
 */
export function fitHeight(base: number, fits: (size: number) => boolean): number | null {
  const min = Math.floor(base * MIN_RATIO)
  if (fits(base)) return null // помещается на базовом — inline-размер не пишем
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
