// Єдиний монолітний анімований фон усього лендингу: плями «аврора» + сітка.
// Стартовий стан (SSR, без JS, «менше руху»): absolute-шар на всю висоту сторінки, їде РАЗОМ зі
// скролом. Після гідрації SiteParallax вмикає паралакс: шар стає fixed на вьюпорт, а рухається
// лише одна доріжка .site-bg-track (повільніше за контент, PARALLAX_RATIO). Стилі — globals.css
// (.site-bg, .site-bg-track, .site-bg-blob), геометрія — core/domain/layout/parallax.
// Плями притиснуті до лівого/правого краю (чергування), кольори — жовтий/фіолетовий; top у % від
// висоти доріжки (data-top — те саме число для JS).
// Батьківський контейнер у layout має position: relative.
//
// ВАЖЛИВО: класи прозорості мають бути зі стандартної шкали Tailwind (кратні 5),
// інакше клас не згенерується і пляма буде без фону (напр. /18 — НЕ працює).

type Blob = {
  top: number; // % від висоти доріжки
  side: "l" | "r";
  cls: string; // bg-* клас з валідною прозорістю
  anim: "anim-drift" | "anim-drift2" | "anim-drift3";
  size: string;
};

const TOPS = [3, 14, 25, 36, 47, 58, 69, 80, 91];
const ANIMS = ["anim-drift", "anim-drift2", "anim-drift3"] as const;
const SIZES = ["36rem", "32rem", "34rem", "38rem"];

const BLOBS: Blob[] = TOPS.map((top, i) => ({
  top,
  side: i % 2 === 0 ? "r" : "l",
  // праворуч — жовті, ліворуч — фіолетові (обидва боки видно)
  cls: i % 2 === 0 ? "bg-brand/20" : "bg-violet-500/25",
  anim: ANIMS[i % ANIMS.length],
  size: SIZES[i % SIZES.length],
}));

export function SiteBackground() {
  return (
    <div aria-hidden="true" data-site-bg className="site-bg">
      <div className="site-bg-track">
        {BLOBS.map((b, i) => (
          <div
            key={i}
            data-top={b.top}
            className={`site-bg-blob ${b.anim} ${b.cls} absolute rounded-full blur-[140px]`}
            style={{
              top: `${b.top}%`,
              [b.side === "r" ? "right" : "left"]: "-11%",
              width: b.size,
              height: b.size,
            }}
          />
        ))}

        <div className="absolute inset-0 bg-grid-faint opacity-[0.18] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]" />
      </div>
    </div>
  );
}
