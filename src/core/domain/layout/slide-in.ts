// core/domain/layout/slide-in — виїзд пунктів зліва по мірі прокрутки (блок «Що ви отримуєте?»,
// уточнення власника 2026-09-17). Без DOM: вимірювання й запис transform/opacity робить
// features/landing/lib/slide-in.ts, тут — константи й арифметика прогресу.
//
// Модель: скраб по позиції (не разовий тригер). «Лінія вводу» — горизонталь на ENTER_LINE висоти
// вьюпорту. Поки верх пункту нижче лінії, пункт зсунутий ліворуч на DISTANCE і прозорий; піднімаючись
// над лінією на BAND × vh, він виїжджає на місце (smoothstep). Три частини пункту йдуть сходинками:
// номер → жовта фраза → сіра частина — прогрес кожної наступної відстає на STAGGER, а шкала стискається
// так, щоб остання частина теж встала на місце рівно тоді, коли пункт пройшов увесь BAND.
// Прокрутка назад — обернений хід (та сама функція позиції). Кінець сторінки: на останніх
// (1 − ENTER_LINE) × vh пікселях прокрутки лінія опускається до vh + BAND × vh — при максимальній
// прокрутці на місці все, що у вікні (блок може бути останнім, якщо клієнт приховав нижчі).
import { smoothstep } from './case-image-zoom'
import { readingLineY } from './word-reveal'

export type SlideInParams = {
  /** Лінія вводу: частка висоти вьюпорту від верху. */
  enterLine: number
  /** Шлях (частка vh), на якому пункт проходить від «зсунутий і прозорий» до «на місці». */
  band: number
  /** Відставання прогресу кожної наступної частини (частка прогресу пункту). */
  stagger: number
  /** Відстань виїзду, px: < SLIDE_IN_DESKTOP_MIN_WIDTH — mobile, інакше — desktop. */
  distanceMobile: number
  distanceDesktop: number
  /**
   * Інерція (мс): стала часу, з якою показаний стан частини наздоганяє цільовий (позицію прокрутки).
   * Колесо миші крутить сторінку сходинками по ~100 px — без інерції частини «стрибають»; з нею рух
   * плавний, як у scroll.locomotive.ca, але нативна прокрутка не підміняється. 0 — без інерції.
   */
  smoothMs: number
}

// Набір «різкіше» — вибір власника за превʼю 2026-09-17 (альтернатива «мʼякше»: 0.85 / 0.25 / 0.12 /
// 48–80 px). Ті самі відстані продубльовано в globals.css (стан до гідрації).
export const SLIDE_IN_DEFAULTS: SlideInParams = {
  enterLine: 0.8,
  band: 0.16,
  stagger: 0.1,
  distanceMobile: 64,
  distanceDesktop: 112,
  // 220 мс — вибір власника за превʼю 2026-09-17 (варіанти 140 / 220 / 320).
  smoothMs: 220,
}

/** Кількість частин пункту (номер, жовта фраза, сіра частина) — шкала сходинок рахується від неї. */
export const SLIDE_IN_PARTS = 3
/** Поріг «десктопної» відстані: той самий sm-брейкпоінт, що в USP і масштабі скріншота (640). */
export const SLIDE_IN_DESKTOP_MIN_WIDTH = 640

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Відстань виїзду для ширини вьюпорту (px — однаковий «поштовх» незалежно від ширини екрана). */
export function slideDistance(vw: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  return vw >= SLIDE_IN_DESKTOP_MIN_WIDTH ? p.distanceDesktop : p.distanceMobile
}

/**
 * Лінія вводу у координатах вьюпорту (px від верху) з урахуванням кінця сторінки: базова =
 * enterLine × vh; на останніх (1 − enterLine) × vh пікселях прокрутки опускається до vh + band × vh.
 */
export function enterLineY(scrollY: number, vh: number, maxScroll: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  return readingLineY(scrollY, vh, maxScroll, p.enterLine, p.band * vh)
}

/**
 * Прогрес пункту 0..1 (без згладжування).
 * @param top верх пункту в координатах документа, px
 * @param scrollY поточна прокрутка
 * @param vh висота вьюпорту
 * @param maxScroll максимальна прокрутка документа (scrollHeight − clientHeight)
 */
export function itemProgress(top: number, scrollY: number, vh: number, maxScroll: number, p: SlideInParams = SLIDE_IN_DEFAULTS): number {
  if (!Number.isFinite(top) || !(vh > 0)) return 1
  const line = enterLineY(scrollY, vh, maxScroll, p)
  const bandPx = Math.max(1, p.band * vh)
  return clamp01((line - (top - scrollY)) / bandPx)
}

/**
 * Прогрес частини за прогресом пункту: частина i стартує на i × stagger і йде швидше (шкала
 * 1 − stagger × (parts − 1)), тож усі частини досягають 1 разом із пунктом.
 */
export function partProgress(itemP: number, part: number, p: SlideInParams = SLIDE_IN_DEFAULTS, parts = SLIDE_IN_PARTS): number {
  const i = Math.max(0, Math.min(parts - 1, Math.floor(part) || 0))
  const span = 1 - p.stagger * (parts - 1)
  if (!(span > 0)) return clamp01(itemP)
  return clamp01((clamp01(itemP) - i * p.stagger) / span)
}

/**
 * Тривалість CSS-переходу (мс), що відтворює інерцію зі сталою часу tau: крива easeOutExpo
 * (1 − 2^(−10t)) — це експонента 1 − e^(−t/τ) з τ = D / (10·ln 2), тож D = τ · 10 · ln 2.
 * Експонента «без памʼяті»: перезапуск переходу з поточного значення до нової цілі дає той самий рух,
 * що й покадрове наближення, але рахує його композитор (покадровий запис із JS на слабких пристроях
 * давав кадри > 20 мс). tau ≤ 0 або сміття → 0 (без переходу).
 */
export function smoothTransitionMs(tauMs: number): number {
  if (!(tauMs > 0) || !Number.isFinite(tauMs)) return 0
  return Math.round(tauMs * 10 * Math.LN2)
}

export type PartState = { x: number; opacity: number }

/** Стан частини: зсув ліворуч (px, ≤ 0) і прозорість за прогресом зі smoothstep. */
export function partState(progress: number, distance: number): PartState {
  const e = smoothstep(progress)
  const x = -Math.max(0, distance) * (1 - e)
  return { x: x === 0 ? 0 : x, opacity: e }
}
