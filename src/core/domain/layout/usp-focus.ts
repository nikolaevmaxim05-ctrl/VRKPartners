// core/domain/layout/usp-focus — правила «активної картки» секції USP на мобільному. Без DOM:
// вимірювання робить компонент Usp (features/landing), тут — константи й вибір активної картки.
//
// На вузьких екранах (≤ USP_MOBILE_MAX_WIDTH) активна — картка, центр якої найближчий до центру
// вьюпорту. Вона трохи збільшується (USP_ACTIVE_SCALE), решта — легке розмиття (USP_DIMMED_BLUR_PX)
// і приглушення (USP_DIMMED_OPACITY). Гістерезис: активна змінюється лише коли інша картка стала
// ближчою до центру помітно — на USP_HYSTERESIS_RATIO висоти вьюпорту, — щоб на межі двох карток не
// було мерехтіння. Картка з центром поза вьюпортом кандидатом не є (секція за екраном → нейтрально).

/** Брейкпоінт «мобільний» для ефекту: max-width у px (Tailwind sm = 640). */
export const USP_MOBILE_MAX_WIDTH = 640
/** Масштаб активної картки. */
export const USP_ACTIVE_SCALE = 1.04
/** Радіус розмиття решти карток, px (не більше 2 — текст лишається читабельним). */
export const USP_DIMMED_BLUR_PX = 1.5
/** Прозорість решти карток. */
export const USP_DIMMED_OPACITY = 0.8
/** Гістерезис зміни активної: частка висоти вьюпорту. */
export const USP_HYSTERESIS_RATIO = 0.08
/** Кандидат — картка, центр якої в межах вьюпорту: відстань до центру ≤ ця частка висоти. */
export const USP_CANDIDATE_RATIO = 0.5

export type UspCardState = 'active' | 'dimmed' | undefined

/**
 * Вибір активної картки з гістерезисом.
 * @param distances відстань центру кожної картки до центру вьюпорту, px (Infinity/NaN — картки немає)
 * @param current поточна активна (-1 — жодної)
 * @param viewportHeight висота вьюпорту, px
 * @returns індекс нової активної або -1
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
  // Поточна лишається, поки інша не стала ближчою щонайменше на гістерезис.
  return bestDist + viewportHeight * ratio < cur ? best : current
}

/** Стан картки для data-state: без активної або при одній картці — нейтрально (без атрибута). */
export function cardState(index: number, active: number, count: number): UspCardState {
  if (active < 0 || count < 2) return undefined
  return index === active ? 'active' : 'dimmed'
}
