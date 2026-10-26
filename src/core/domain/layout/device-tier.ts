// core/domain/layout/device-tier — режим «lite» для слабких пристроїв і вбудованих браузерів.
//
// Сигнали (усі — страховка одне одного): мало памʼяті (navigator.deviceMemory), мало ядер
// (hardwareConcurrency), економія трафіку (connection.saveData), «менше руху», вбудований браузер
// за User-Agent (Threads — «Barcelona», Instagram, Facebook — FBAN/FBAV, Android WebView — «; wv)»),
// а також (рішення власника, LITE_ON_NARROW_VIEWPORTS) будь-який вузький вьюпорт — на телефонах
// дизайн простіший і надійніший. У режимі lite CSS (globals.css, блок html.lite) вимикає
// backdrop-filter, свічення-blur, розмиття карток USP, нескінченну стрічку партнерів, маски країв,
// анімацію фону та will-change появи. Клас ставить інлайн-скрипт у layout сайту ДО першого кадру —
// текст скрипта генерує liteDetectionScript() з тих самих констант, що й isLiteDevice().

export type DeviceSignals = {
  /** navigator.deviceMemory, ГБ (Chromium; у Safari немає). */
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

/** Памʼять ≤ цього (ГБ) — слабкий пристрій. */
export const LITE_MAX_MEMORY_GB = 4
/** Ядер ≤ цього — слабкий пристрій. */
export const LITE_MAX_CORES = 4
/** Вузький вьюпорт (< цього, px) — lite безумовно (той самий поріг, що й у мобільних ефектів: Tailwind sm). */
export const LITE_NARROW_MAX_WIDTH = 640
/** Рішення власника: застосовувати lite до всіх вузьких вьюпортів, а не лише за сигналами. */
export const LITE_ON_NARROW_VIEWPORTS = true

/** Маркери вбудованих браузерів у User-Agent (підрядки, регістр важливий). */
export const EMBEDDED_BROWSER_MARKERS: readonly string[] = ['Barcelona', 'Instagram', 'FBAN', 'FBAV', '; wv)']

/** Клас на <html>, під яким у globals.css лежить блок правил lite. */
export const LITE_CLASS = 'lite'

export function isEmbeddedBrowser(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  return EMBEDDED_BROWSER_MARKERS.some((m) => userAgent.includes(m))
}

export function isNarrowViewport(viewportWidth: number | undefined): boolean {
  return LITE_ON_NARROW_VIEWPORTS && typeof viewportWidth === 'number' && viewportWidth > 0 && viewportWidth < LITE_NARROW_MAX_WIDTH
}

/** Чи вмикати режим lite за сигналами пристрою. Невідомий сигнал (undefined/0) — не сигнал. */
export function isLiteDevice(s: DeviceSignals): boolean {
  if (isNarrowViewport(s.viewportWidth)) return true
  if (typeof s.deviceMemory === 'number' && s.deviceMemory > 0 && s.deviceMemory <= LITE_MAX_MEMORY_GB) return true
  if (typeof s.hardwareConcurrency === 'number' && s.hardwareConcurrency > 0 && s.hardwareConcurrency <= LITE_MAX_CORES) return true
  if (s.saveData === true) return true
  if (s.reducedMotion === true) return true
  if (isEmbeddedBrowser(s.userAgent)) return true
  return false
}

/** Інлайн-JS для <script> у layout: ті самі правила, що й isLiteDevice, без залежностей; ставить LITE_CLASS. */
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
