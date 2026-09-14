// core/domain/layout/case-image-zoom — автозбільшення скріншота кейсу на мобільному (крок 5 мобільних
// анімацій). Без DOM: вимірювання й запис transform робить features/landing/lib/case-image-zoom.ts.
//
// Модель: скраб по позиції. Чим ближче центр картинки до центру вьюпорту, тим більший масштаб —
// до повної ширини екрана (картинка центрована в картці, картка — у вьюпорті, тож при S = vw / width
// краї картинки збігаються з краями екрана; беремо vw − EDGE_PX, щоб округлення не породило
// горизонтальний скрол). Поза зоною ±ZONE × vh від центру — масштаб 1; усередині — smoothstep.
// Прокрутка назад — обернений хід (та сама функція позиції).

/** Брейкпоінт ефекту: max-width у px (той самий поріг, що в USP). */
export const CASE_ZOOM_MAX_WIDTH = 640
/** Верхня межа масштабу (на дуже вузьких картинках не роздуваємо безмежно). */
export const CASE_ZOOM_MAX_SCALE = 1.6
/** Зона ефекту: частка висоти вьюпорту від центру, за якою масштаб = 1. */
export const CASE_ZOOM_ZONE = 0.35
/** Запас від країв екрана, px (округлення transform не має дати горизонтального скролу). */
export const CASE_ZOOM_EDGE_PX = 2

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Цільовий масштаб «на всю ширину»: min((vw − edge) / width, max), не менше 1. */
export function targetScale(vw: number, imageWidth: number, maxScale = CASE_ZOOM_MAX_SCALE, edge = CASE_ZOOM_EDGE_PX): number {
  if (!(vw > 0) || !(imageWidth > 0)) return 1
  return Math.max(1, Math.min(maxScale, (vw - edge) / imageWidth))
}

/** Прогрес 0..1 за відстанню центру картинки (px у вьюпорті) до центру екрана. */
export function zoomProgress(centerY: number, vh: number, zone = CASE_ZOOM_ZONE): number {
  if (!Number.isFinite(centerY) || !(vh > 0) || !(zone > 0)) return 0
  return 1 - clamp01(Math.abs(centerY - vh / 2) / (zone * vh))
}

/** Згладжування smoothstep: 0 → 0, 1 → 1, плавні краї. */
export function smoothstep(p: number): number {
  const t = clamp01(p)
  return t * t * (3 - 2 * t)
}

/** Масштаб картинки для поточного положення: 1 + (S − 1) × smoothstep(прогрес). */
export function zoomScale(centerY: number, vh: number, vw: number, imageWidth: number): number {
  const s = targetScale(vw, imageWidth)
  return 1 + (s - 1) * smoothstep(zoomProgress(centerY, vh))
}

/** Запас по вертикалі з кожного боку: на скільки збільшена картинка вища за вихідну, поділено навпіл. */
export function verticalReserve(scale: number, height: number): number {
  if (!(scale > 1) || !(height > 0)) return 0
  return ((scale - 1) * height) / 2
}
