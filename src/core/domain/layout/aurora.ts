// core/domain/layout/aurora — «аврора»-плями фону лендингу без filter: blur.
//
// Чому: розмита пляма (filter: blur(140px)) у браузері — окремий композитний шар розміром
// (діаметр + 6σ)² у device-пікселях: на 390px / DPR 3 це ≈ 4300×4300 px ≈ 72 МБ на пляму, ×9 плям,
// а анімація scale змушує перераховувати розмиття щокадру. Слабкі телефони та вбудовані браузери
// (Threads/Instagram) на цьому «здаються»: сторінка лишається білою, при прокрутці блимає.
// Радіальний градієнт зі спадом, підібраним під профіль диска, згорнутого з гаусом, виглядає так
// само, але малюється звичайним растром у тайли кореневого шару — без окремих шарів і фільтрів.
//
// Тут — лише чисті правила (геометрія, профіль спаду, перелік плям); DOM — SiteBackground.

/** Профіль яскравості диска радіуса R, згорнутого з гаусом σ = 0.49R (blur 140px при R = 288px):
 *  [частка радіуса боксу, частка пікової яскравості]. Чисельно проінтегровано один раз;
 *  бокс градієнта = AURORA_EXTENT_RATIO × R (далі яскравість < 1 %). */
export const AURORA_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.1, 0.974],
  [0.2, 0.894],
  [0.3, 0.765],
  [0.4, 0.6],
  [0.5, 0.424],
  [0.6, 0.266],
  [0.7, 0.146],
  [0.8, 0.07],
  [0.9, 0.029],
  [1, 0],
]

/** Радіус боксу градієнта відносно номінального радіуса плями (R + 2.2σ). */
export const AURORA_EXTENT_RATIO = 2.07

/** Пікова яскравість у центрі відносно непрозорості кольору (диск R ≈ 2σ не «насичується» повністю). */
export const AURORA_PEAK = 0.879

export type AuroraColor = { rgb: readonly [number, number, number]; alpha: number }

/** Кольори плям: праворуч — жовтий бренду (brand/20), ліворуч — фіолетовий (violet-500/25). */
export const AURORA_COLORS = {
  brand: { rgb: [246, 247, 64], alpha: 0.2 },
  violet: { rgb: [139, 92, 246], alpha: 0.25 },
} as const satisfies Record<string, AuroraColor>

export type AuroraBlob = {
  /** Верх номінального диска, % висоти сторінки. */
  top: number
  side: 'l' | 'r'
  color: keyof typeof AURORA_COLORS
  /** Номінальний діаметр диска, rem. */
  size: number
  /** Група анімації (десктоп): плями однієї групи рухаються разом — ≤ 3 композитних шари. */
  group: 0 | 1 | 2
}

const TOPS = [3, 14, 25, 36, 47, 58, 69, 80, 91]
const SIZES = [36, 32, 34, 38]

/** Дев'ять плям: чергування правий/лівий край, розподіл по висоті сторінки (як у вихідному дизайні). */
export const AURORA_BLOBS: readonly AuroraBlob[] = TOPS.map((top, i) => ({
  top,
  side: i % 2 === 0 ? 'r' : 'l',
  color: i % 2 === 0 ? 'brand' : 'violet',
  size: SIZES[i % SIZES.length],
  group: (i % 3) as 0 | 1 | 2,
}))

/** Горизонтальний «вихід» диска за край контейнера, % ширини (як у вихідному дизайні). */
export const AURORA_EDGE_OVERHANG_PCT = 11

/** CSS radial-gradient, що імітує розмитий диск заданого кольору (бокс — квадрат, circle closest-side). */
export function auroraGradient(color: AuroraColor): string {
  const [r, g, b] = color.rgb
  const stops = AURORA_PROFILE.map(([pos, k]) => {
    const a = Math.round(color.alpha * AURORA_PEAK * k * 1000) / 1000
    return `rgba(${r},${g},${b},${a}) ${Math.round(pos * 100)}%`
  })
  return `radial-gradient(circle closest-side, ${stops.join(', ')})`
}

export type AuroraBox = {
  /** Сторона квадратного боксу градієнта, rem. */
  box: number
  /** На скільки бокс виходить за межі номінального диска з кожного боку, rem. */
  offset: number
}

/** Геометрія боксу градієнта для плями номінального діаметра size (rem). */
export function auroraBox(size: number): AuroraBox {
  const radius = size / 2
  const extent = radius * AURORA_EXTENT_RATIO
  return { box: round2(extent * 2), offset: round2(extent - radius) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
