// core/domain/layout/aurora — «аврора»-пятна фона лендинга без filter: blur.
//
// Почему: размытое пятно (filter: blur(140px)) в браузере — отдельный композитный слой размером
// (диаметр + 6σ)² в device-пикселях: на 390px / DPR 3 это ≈ 4300×4300 px ≈ 72 МБ на пятно, ×9 пятен,
// а анимация scale заставляет пересчитывать размытие каждый кадр. Слабые телефоны и встроенные браузеры
// (Threads/Instagram) на этом «сдаются»: страница остаётся белой, при прокрутке мигает.
// Радиальный градиент со спадом, подобранным под профиль диска, свёрнутого с гауссом, выглядит так
// же, но рисуется обычным растром в тайлы корневого слоя — без отдельных слоёв и фильтров.
//
// Здесь — только чистые правила (геометрия, профиль спада, перечень пятен); DOM — SiteBackground.

/** Профиль яркости диска радиуса R, свёрнутого с гауссом σ = 0.49R (blur 140px при R = 288px):
 *  [доля радиуса бокса, доля пиковой яркости]. Численно проинтегрирован один раз;
 *  бокс градиента = AURORA_EXTENT_RATIO × R (дальше яркость < 1 %). */
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

/** Радиус бокса градиента относительно номинального радиуса пятна (R + 2.2σ). */
export const AURORA_EXTENT_RATIO = 2.07

/** Пиковая яркость в центре относительно непрозрачности цвета (диск R ≈ 2σ не «насыщается» полностью). */
export const AURORA_PEAK = 0.879

export type AuroraColor = { rgb: readonly [number, number, number]; alpha: number }

/** Цвета пятен: справа — жёлтый бренда (brand/20), слева — фиолетовый (violet-500/25). */
export const AURORA_COLORS = {
  brand: { rgb: [246, 247, 64], alpha: 0.2 },
  violet: { rgb: [139, 92, 246], alpha: 0.25 },
} as const satisfies Record<string, AuroraColor>

export type AuroraBlob = {
  /** Верх номинального диска, % высоты страницы. */
  top: number
  side: 'l' | 'r'
  color: keyof typeof AURORA_COLORS
  /** Номинальный диаметр диска, rem. */
  size: number
  /** Группа анимации (десктоп): пятна одной группы движутся вместе — ≤ 3 композитных слоя. */
  group: 0 | 1 | 2
}

const TOPS = [3, 14, 25, 36, 47, 58, 69, 80, 91]
const SIZES = [36, 32, 34, 38]

/** Девять пятен: чередование правый/левый край, распределение по высоте страницы (как в исходном дизайне). */
export const AURORA_BLOBS: readonly AuroraBlob[] = TOPS.map((top, i) => ({
  top,
  side: i % 2 === 0 ? 'r' : 'l',
  color: i % 2 === 0 ? 'brand' : 'violet',
  size: SIZES[i % SIZES.length],
  group: (i % 3) as 0 | 1 | 2,
}))

/** Горизонтальный «выход» диска за край контейнера, % ширины (как в исходном дизайне). */
export const AURORA_EDGE_OVERHANG_PCT = 11

/** CSS radial-gradient, имитирующий размытый диск заданного цвета (бокс — квадрат, circle closest-side). */
export function auroraGradient(color: AuroraColor): string {
  const [r, g, b] = color.rgb
  const stops = AURORA_PROFILE.map(([pos, k]) => {
    const a = Math.round(color.alpha * AURORA_PEAK * k * 1000) / 1000
    return `rgba(${r},${g},${b},${a}) ${Math.round(pos * 100)}%`
  })
  return `radial-gradient(circle closest-side, ${stops.join(', ')})`
}

export type AuroraBox = {
  /** Сторона квадратного бокса градиента, rem. */
  box: number
  /** На сколько бокс выходит за пределы номинального диска с каждой стороны, rem. */
  offset: number
}

/** Геометрия бокса градиента для пятна номинального диаметра size (rem). */
export function auroraBox(size: number): AuroraBox {
  const radius = size / 2
  const extent = radius * AURORA_EXTENT_RATIO
  return { box: round2(extent * 2), offset: round2(extent - radius) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
