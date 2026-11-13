// core/domain/layout/device-tier — режим «lite» для слабых устройств и встроенных браузеров.
//
// Сигналы (все — страховка друг друга): мало памяти (navigator.deviceMemory), мало ядер
// (hardwareConcurrency), экономия трафика (connection.saveData), «меньше движения», встроенный браузер
// по User-Agent (Threads — «Barcelona», Instagram, Facebook — FBAN/FBAV, Android WebView — «; wv)»),
// а также (решение владельца, LITE_ON_NARROW_VIEWPORTS) любой узкий вьюпорт — на телефонах
// дизайн проще и надёжнее. В режиме lite CSS (globals.css, блок html.lite) выключает
// backdrop-filter, свечение-blur, размытие карточек USP, бесконечную ленту партнёров, маски краёв,
// анимацию фона и will-change появления. Класс ставит инлайн-скрипт в layout сайта ДО первого кадра —
// текст скрипта генерирует liteDetectionScript() из тех же констант, что и isLiteDevice().

export type DeviceSignals = {
  /** navigator.deviceMemory, ГБ (Chromium; в Safari нет). */
  deviceMemory?: number
  /** navigator.hardwareConcurrency. */
  hardwareConcurrency?: number
  /** navigator.connection.saveData. */
  saveData?: boolean
  /** matchMedia('(prefers-reduced-motion: reduce)').matches */
  reducedMotion?: boolean
  userAgent?: string
  /** window.innerWidth, CSS px. */
  viewportWidth?: number
}

/** Память ≤ этого (ГБ) — слабое устройство. */
export const LITE_MAX_MEMORY_GB = 4
/** Ядер ≤ этого — слабое устройство. */
export const LITE_MAX_CORES = 4
/** Узкий вьюпорт (< этого, px) — lite безусловно (тот же порог, что и у мобильных эффектов: Tailwind sm). */
export const LITE_NARROW_MAX_WIDTH = 640
/** Решение владельца: применять lite ко всем узким вьюпортам, а не только по сигналам. */
export const LITE_ON_NARROW_VIEWPORTS = true

/** Маркеры встроенных браузеров в User-Agent (подстроки, регистр важен). */
export const EMBEDDED_BROWSER_MARKERS: readonly string[] = ['Barcelona', 'Instagram', 'FBAN', 'FBAV', '; wv)']

/** Класс на <html>, под которым в globals.css лежит блок правил lite. */
export const LITE_CLASS = 'lite'

export function isEmbeddedBrowser(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  return EMBEDDED_BROWSER_MARKERS.some((m) => userAgent.includes(m))
}

export function isNarrowViewport(viewportWidth: number | undefined): boolean {
  return LITE_ON_NARROW_VIEWPORTS && typeof viewportWidth === 'number' && viewportWidth > 0 && viewportWidth < LITE_NARROW_MAX_WIDTH
}

/** Включать ли режим lite по сигналам устройства. Неизвестный сигнал (undefined/0) — не сигнал. */
export function isLiteDevice(s: DeviceSignals): boolean {
  if (isNarrowViewport(s.viewportWidth)) return true
  if (typeof s.deviceMemory === 'number' && s.deviceMemory > 0 && s.deviceMemory <= LITE_MAX_MEMORY_GB) return true
  if (typeof s.hardwareConcurrency === 'number' && s.hardwareConcurrency > 0 && s.hardwareConcurrency <= LITE_MAX_CORES) return true
  if (s.saveData === true) return true
  if (s.reducedMotion === true) return true
  if (isEmbeddedBrowser(s.userAgent)) return true
  return false
}

/** Инлайн-JS для <script> в layout: те же правила, что и isLiteDevice, без зависимостей; ставит LITE_CLASS. */
export function liteDetectionScript(): string {
  const markers = EMBEDDED_BROWSER_MARKERS.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const narrow = LITE_ON_NARROW_VIEWPORTS ? `(innerWidth>0&&innerWidth<${LITE_NARROW_MAX_WIDTH})||` : ''
  return (
    `try{var n=navigator,c=n.connection;` +
    `if(${narrow}(n.deviceMemory>0&&n.deviceMemory<=${LITE_MAX_MEMORY_GB})||` +
    `(n.hardwareConcurrency>0&&n.hardwareConcurrency<=${LITE_MAX_CORES})||` +
    `(c&&c.saveData===true)||matchMedia('(prefers-reduced-motion: reduce)').matches||` +
    `/${markers}/.test(n.userAgent||''))document.documentElement.classList.add('${LITE_CLASS}')}catch(e){}`
  )
}
