// Єдиний монолітний анімований фон усього лендингу.
// Absolute-шар на всю висоту сторінки: плями «аврора» рухаються РАЗОМ зі скролом.
// Плями притиснуті до лівого/правого краю (чергування), кольори — жовтий/фіолетовий.
// Батьківський контейнер у layout має position: relative.
//
// ВАЖЛИВО: класи прозорості мають бути зі стандартної шкали Tailwind (кратні 5),
// інакше клас не згенерується і пляма буде без фону (напр. /18 — НЕ працює).

type Blob = {
  top: string;
  side: "l" | "r";
  cls: string; // bg-* клас з валідною прозорістю
  anim: "anim-drift" | "anim-drift2" | "anim-drift3";
  size: string;
};

const TOPS = [3, 14, 25, 36, 47, 58, 69, 80, 91];
const ANIMS = ["anim-drift", "anim-drift2", "anim-drift3"] as const;
const SIZES = ["36rem", "32rem", "34rem", "38rem"];

const BLOBS: Blob[] = TOPS.map((top, i) => ({
  top: `${top}%`,
  side: i % 2 === 0 ? "r" : "l",
  // праворуч — жовті, ліворуч — фіолетові (обидва боки видно)
  cls: i % 2 === 0 ? "bg-brand/20" : "bg-violet-500/25",
  anim: ANIMS[i % ANIMS.length],
  size: SIZES[i % SIZES.length],
}));

export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={`${b.anim} ${b.cls} absolute rounded-full blur-[140px]`}
          style={{
            top: b.top,
            [b.side === "r" ? "right" : "left"]: "-11%",
            width: b.size,
            height: b.size,
          }}
        />
      ))}

      <div className="absolute inset-0 bg-grid-faint opacity-[0.18] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]" />
    </div>
  );
}
