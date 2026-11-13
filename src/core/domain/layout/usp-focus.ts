// core/domain/layout/usp-focus — правила «активной карточки» секции USP на мобильном. Без DOM:
// измерение делает компонент Usp (features/landing), здесь — константы и выбор активной карточки.
//
// На узких экранах (≤ USP_MOBILE_MAX_WIDTH) активная — карточка, центр которой ближе всего к центру
// вьюпорта. Она немного увеличивается (USP_ACTIVE_SCALE), остальные — лёгкое размытие (USP_DIMMED_BLUR_PX)
// и приглушение (USP_DIMMED_OPACITY). Гистерезис: активная меняется только когда другая карточка стала
// ближе к центру заметно — на USP_HYSTERESIS_RATIO высоты вьюпорта, — чтобы на границе двух карточек не
// было мерцания. Карточка с центром вне вьюпорта кандидатом не является (секция за экраном → нейтрально).

/** Брейкпоинт «мобильный» для эффекта: max-width в px (Tailwind sm = 640). */
export const USP_MOBILE_MAX_WIDTH = 640
/** Масштаб активной карточки. */
export const USP_ACTIVE_SCALE = 1.04
/** Радиус размытия остальных карточек, px (не больше 2 — текст остаётся читаемым). */
export const USP_DIMMED_BLUR_PX = 1.5
/** Прозрачность остальных карточек. */
export const USP_DIMMED_OPACITY = 0.8
/** Гистерезис смены активной: доля высоты вьюпорта. */
export const USP_HYSTERESIS_RATIO = 0.08
/** Кандидат — карточка, центр которой в пределах вьюпорта: расстояние до центра ≤ эта доля высоты. */
export const USP_CANDIDATE_RATIO = 0.5

export type UspCardState = 'active' | 'dimmed' | undefined

/**
 * Выбор активной карточки с гистерезисом.
 * @param distances расстояние центра каждой карточки до центра вьюпорта, px (Infinity/NaN — карточки нет)
 * @param current текущая активная (-1 — ни одной)
 * @param viewportHeight высота вьюпорта, px
 * @returns индекс новой активной или -1
 */
export function pickActive(
  distances: number[],
  current: number,
  viewportHeight: number,
  ratio = USP_HYSTERESIS_RATIO,
  candidateRatio = USP_CANDIDATE_RATIO,
): number {
  const maxDist = viewportHeight * candidateRatio
  let best = -1
  let bestDist = Infinity
  distances.forEach((d, i) => {
    if (!Number.isFinite(d) || d > maxDist) return
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  if (best === -1) return -1
  const cur = current >= 0 && current < distances.length ? distances[current] : Infinity
  const currentIsCandidate = Number.isFinite(cur) && cur <= maxDist
  if (!currentIsCandidate) return best
  // Текущая остаётся, пока другая не стала ближе хотя бы на гистерезис.
  return bestDist + viewportHeight * ratio < cur ? best : current
}

/** Состояние карточки для data-state: без активной или при одной карточке — нейтрально (без атрибута). */
export function cardState(index: number, active: number, count: number): UspCardState {
  if (active < 0 || count < 2) return undefined
  return index === active ? 'active' : 'dimmed'
}
