// core/domain/layout/slide-in — выезд пунктов слева по мере прокрутки (блок «Що ви отримуєте?»,
// уточнение владельца 2026-09-17). Без DOM: измерение и запись transform/opacity делает
// features/landing/lib/slide-in.ts, здесь — константы и арифметика прогресса.
//
// Модель: скраб по позиции (не разовый триггер). «Линия ввода» — горизонталь на ENTER_LINE высоты
// вьюпорта. Пока верх пункта ниже линии, пункт сдвинут влево на DISTANCE и прозрачен; поднимаясь
// над линией на BAND × vh, он выезжает на место (smoothstep). Три части пункта идут ступеньками:
// номер → жёлтая фраза → серая часть — прогресс каждой следующей отстаёт на STAGGER, а шкала сжимается
// так, чтобы последняя часть тоже встала на место ровно тогда, когда пункт прошёл весь BAND.
// Прокрутка назад — обратный ход (та же функция позиции). Конец страницы: на последних
// (1 − ENTER_LINE) × vh пикселях прокрутки линия опускается до vh + BAND × vh — при максимальной
// прокрутке на месте всё, что в окне (блок может быть последним, если клиент скрыл нижние).
import { smoothstep } from './case-image-zoom'
import { readingLineY } from './word-reveal'

export type SlideInParams = {
  /** Линия ввода: доля высоты вьюпорта от верха. */
  enterLine: number
  /** Путь (доля vh), на котором пункт проходит от «сдвинут и прозрачен» до «на месте». */
  band: number
  /** Отставание прогресса каждой следующей части (доля прогресса пункта). */
  stagger: number
  /** Расстояние выезда, px: < SLIDE_IN_DESKTOP_MIN_WIDTH — mobile, иначе — desktop. */
  distanceMobile: number
  distanceDesktop: number
  /**
   * Инерция (мс): постоянная времени, с которой показанное состояние части догоняет целевое (позицию
   * прокрутки). Колесо мыши крутит страницу ступеньками по ~100 px — без инерции части «прыгают»; с ней
   * движение плавное, как у scroll.locomotive.ca, но нативная прокрутка не подменяется. 0 — без инерции.
   */
  smoothMs: number
}

// Набор «резче» — выбор владельца по превью 2026-09-17 (альтернатива «мягче»: 0.85 / 0.25 / 0.12 /
// 48–80 px). Те же расстояния продублированы в globals.css (состояние до гидрации).
export const SLIDE_IN_DEFAULTS: SlideInParams = {
  enterLine: 0.8,
  band: 0.16,
  stagger: 0.1,
  distanceMobile: 64,
  distanceDesktop: 112,
  // 220 мс — выбор владельца по превью 2026-09-17 (варианты 140 / 220 / 320).
  smoothMs: 220,
}

/** Количество частей пункта (номер, жёлтая фраза, серая часть) — шкала ступенек считается от него. */
export const SLIDE_IN_PARTS = 3
/** Порог «десктопного» расстояния: тот же sm-брейкпоинт, что в USP и масштабе скриншота (640). */
export const SLIDE_IN_DESKTOP_MIN_WIDTH = 640

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Расстояние выезда для ширины вьюпорта (px — одинаковый «толчок» независимо от ширины экрана). */
export function slideDistance(vw: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  return vw >= SLIDE_IN_DESKTOP_MIN_WIDTH ? p.distanceDesktop : p.distanceMobile
}

/**
 * Линия ввода в координатах вьюпорта (px от верха) с учётом конца страницы: базовая =
 * enterLine × vh; на последних (1 − enterLine) × vh пикселях прокрутки опускается до vh + band × vh.
 */
export function enterLineY(scrollY: number, vh: number, maxScroll: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  return readingLineY(scrollY, vh, maxScroll, p.enterLine, p.band * vh)
}

/**
 * Прогресс пункта 0..1 (без сглаживания).
 * @param top верх пункта в координатах документа, px
 * @param scrollY текущая прокрутка
 * @param vh высота вьюпорта
 * @param maxScroll максимальная прокрутка документа (scrollHeight − clientHeight)
 */
export function itemProgress(top: number, scrollY: number, vh: number, maxScroll: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  if (!Number.isFinite(top) || !(vh > 0)) return 1
  const line = enterLineY(scrollY, vh, maxScroll, p)
  const bandPx = Math.max(1, p.band * vh)
  return clamp01((line - (top - scrollY)) / bandPx)
}

/**
 * Прогресс части по прогрессу пункта: часть i стартует на i × stagger и идёт быстрее (шкала
 * 1 − stagger × (parts − 1)), так что все части достигают 1 вместе с пунктом.
 */
export function partProgress(itemP: number, part: number, p: SlideInParams = SLIDE_IN_DEFAULTS, parts = SLIDE_IN_PARTS): number {
  const i = Math.max(0, Math.min(parts - 1, Math.floor(part) || 0))
  const span = 1 - p.stagger * (parts - 1)
  if (!(span > 0)) return clamp01(itemP)
  return clamp01((clamp01(itemP) - i * p.stagger) / span)
}

/**
 * Длительность CSS-перехода (мс), воспроизводящего инерцию с постоянной времени tau: кривая easeOutExpo
 * (1 − 2^(−10t)) — это экспонента 1 − e^(−t/τ) с τ = D / (10·ln 2), так что D = τ · 10 · ln 2.
 * Экспонента «без памяти»: перезапуск перехода с текущего значения к новой цели даёт то же движение,
 * что и покадровое приближение, но считает его композитор (покадровая запись из JS на слабых устройствах
 * давала кадры > 20 мс). tau ≤ 0 или мусор → 0 (без перехода).
 */
export function smoothTransitionMs(tauMs: number): number {
  if (!(tauMs > 0) || !Number.isFinite(tauMs)) return 0
  return Math.round(tauMs * 10 * Math.LN2)
}

export type PartState = { x: number; opacity: number }

/** Состояние части: сдвиг влево (px, ≤ 0) и прозрачность по прогрессу со smoothstep. */
export function partState(progress: number, distance: number): PartState {
  const e = smoothstep(progress)
  const x = -Math.max(0, distance) * (1 - e)
  return { x: x === 0 ? 0 : x, opacity: e }
}
