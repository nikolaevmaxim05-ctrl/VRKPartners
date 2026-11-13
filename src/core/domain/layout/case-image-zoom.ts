// core/domain/layout/case-image-zoom — автоувеличение скриншота кейса на мобильном (шаг 5 мобильных
// анимаций). Без DOM: измерение и запись transform делает features/landing/lib/case-image-zoom.ts.
//
// Модель: скраб по позиции. Чем ближе центр картинки к центру вьюпорта, тем больше масштаб — до
// полной ширины экрана (картинка центрирована в карточке, карточка — во вьюпорте, поэтому при
// S = vw / width края картинки совпадают с краями экрана; берём vw − EDGE_PX, чтобы округление не
// породило горизонтальный скролл). Вне зоны ±ZONE × vh от центра — масштаб 1; внутри — smoothstep.
// Прокрутка назад — обратный ход (та же функция позиции).

/** Брейкпоинт эффекта: max-width в px (тот же порог, что в USP). */
export const CASE_ZOOM_MAX_WIDTH = 640
/** Верхняя граница масштаба (на очень узких картинках не раздуваем безмерно). */
export const CASE_ZOOM_MAX_SCALE = 1.6
/** Зона эффекта: доля высоты вьюпорта от центра, за которой масштаб = 1. */
export const CASE_ZOOM_ZONE = 0.35
/** Запас от краёв экрана, px (округление transform не должно дать горизонтального скролла). */
export const CASE_ZOOM_EDGE_PX = 2

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Целевой масштаб «на всю ширину»: min((vw − edge) / width, max), не меньше 1. */
export function targetScale(vw: number, imageWidth: number, maxScale = CASE_ZOOM_MAX_SCALE, edge = CASE_ZOOM_EDGE_PX): number {
  if (!(vw > 0) || !(imageWidth > 0)) return 1
  return Math.max(1, Math.min(maxScale, (vw - edge) / imageWidth))
}

/** Прогресс 0..1 по расстоянию центра картинки (px во вьюпорте) до центра экрана. */
export function zoomProgress(centerY: number, vh: number, zone = CASE_ZOOM_ZONE): number {
  if (!Number.isFinite(centerY) || !(vh > 0) || !(zone > 0)) return 0
  return 1 - clamp01(Math.abs(centerY - vh / 2) / (zone * vh))
}

/** Сглаживание smoothstep: 0 → 0, 1 → 1, плавные края. */
export function smoothstep(p: number): number {
  const t = clamp01(p)
  return t * t * (3 - 2 * t)
}

/** Масштаб картинки для текущего положения: 1 + (S − 1) × smoothstep(прогресс). */
export function zoomScale(centerY: number, vh: number, vw: number, imageWidth: number): number {
  const s = targetScale(vw, imageWidth)
  return 1 + (s - 1) * smoothstep(zoomProgress(centerY, vh))
}

/** Запас по вертикали с каждой стороны: на сколько увеличенная картинка выше исходной, поделённое пополам. */
export function verticalReserve(scale: number, height: number): number {
  if (!(scale > 1) || !(height > 0)) return 0
  return ((scale - 1) * height) / 2
}
