// Єдиний фон усього лендингу: «аврора»-плями + ледь помітна сітка. Absolute-шар на всю висоту
// сторінки — плями рухаються РАЗОМ зі скролом (батьківський .site у layout має position: relative).
//
// Плями — radial-gradient (core/domain/layout/aurora), а НЕ filter: blur: розмита пляма ставала
// окремим композитним шаром ≈ (діаметр + 6σ)² device-пікселів (390px / DPR 3 → ≈ 72 МБ × 9), і
// на слабких телефонах / у вбудованих браузерах (Threads, Instagram) сторінка лишалася білою.
// Градієнт малюється звичайним растром у тайли кореневого шару — ні шарів, ні фільтрів.
// Сітка — background-image на тому ж принципі, затухання зверху/знизу — градієнтом кольору
// сторінки поверх ліній (без mask-image, який робив шар у всю висоту сторінки). Сітка лежить ПІД
// плямами, тож затухання на краях не торкається плям.
//
// Анімація (лише transform: translate, без scale/opacity — globals.css, @keyframes drift*) — на трьох
// групах по три плями: на десктопі ≤ 3 композитних шари. На мобільному (< 640px), у «менше руху»
// та в html.lite анімації немає (globals.css) — фон статичний і композитних шарів не має зовсім.
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

/* Лінії сітки: rgba 0.035 × колишня opacity 0.18 = 0.0063 (opacity на елементі створювала б
   окремий шар на всю сторінку). Перший шар — затухання кольором сторінки (#0B0B0E) у верхніх і
   нижніх 5 %, далі — горизонтальні та вертикальні лінії з кроком 64px. */
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
