// Единый фон всего лендинга: «аврора»-пятна + едва заметная сетка. Absolute-слой на всю высоту
// страницы — пятна движутся ВМЕСТЕ со скроллом (родительский .site в layout имеет position: relative).
//
// Пятна — radial-gradient (core/domain/layout/aurora), а НЕ filter: blur: размытое пятно становилось
// отдельным композитным слоем ≈ (диаметр + 6σ)² device-пикселей (390px / DPR 3 → ≈ 72 МБ × 9), и
// на слабых телефонах / во встроенных браузерах (Threads, Instagram) страница оставалась белой.
// Градиент рисуется обычным растром в тайлы корневого слоя — ни слоёв, ни фильтров.
// Сетка — background-image по тому же принципу, затухание сверху/снизу — градиентом цвета
// страницы поверх линий (без mask-image, который делал слой во всю высоту страницы). Сетка лежит ПОД
// пятнами, так что затухание на краях не касается пятен.
//
// Анимация (только transform: translate, без scale/opacity — globals.css, @keyframes drift*) — на трёх
// группах по три пятна: на десктопе ≤ 3 композитных слоя. На мобильном (< 640px), в «меньше движения»
// и в html.lite анимации нет (globals.css) — фон статичен и композитных слоёв не имеет вовсе.
import {
  AURORA_BLOBS,
  AURORA_COLORS,
  AURORA_EDGE_OVERHANG_PCT,
  auroraBox,
  auroraGradient,
} from "@core/domain/layout/aurora";

const GROUP_ANIM = ["anim-drift", "anim-drift2", "anim-drift3"] as const;

const GRADIENTS = {
  brand: auroraGradient(AURORA_COLORS.brand),
  violet: auroraGradient(AURORA_COLORS.violet),
} as const;

/* Линии сетки: rgba 0.035 × прежняя opacity 0.18 = 0.0063 (opacity на элементе создавала бы
   отдельный слой на всю страницу). Первый слой — затухание цветом страницы (#0B0B0E) в верхних и
   нижних 5 %, далее — горизонтальные и вертикальные линии с шагом 64px. */
const GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to bottom, #0B0B0E, rgba(11,11,14,0) 5%, rgba(11,11,14,0) 95%, #0B0B0E), " +
    "linear-gradient(rgba(255,255,255,0.0063) 1px, transparent 1px), " +
    "linear-gradient(90deg, rgba(255,255,255,0.0063) 1px, transparent 1px)",
  backgroundSize: "100% 100%, 64px 64px, 64px 64px",
} as const;

export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0" style={GRID_STYLE} />

      {GROUP_ANIM.map((anim, g) => (
        <div key={anim} className={`${anim} absolute inset-0`}>
          {AURORA_BLOBS.filter((b) => b.group === g).map((b, i) => {
            const { box, offset } = auroraBox(b.size);
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  width: `${box}rem`,
                  height: `${box}rem`,
                  top: `calc(${b.top}% - ${offset}rem)`,
                  [b.side === "r" ? "right" : "left"]: `calc(-${AURORA_EDGE_OVERHANG_PCT}% - ${offset}rem)`,
                  backgroundImage: GRADIENTS[b.color],
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
