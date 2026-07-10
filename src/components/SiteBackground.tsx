// Єдиний монолітний анімований фон усього лендингу.
// Absolute-шар на всю висоту сторінки: плями «аврора» рухаються РАЗОМ зі скролом.
// Плями притиснуті до лівого/правого краю і йдуть щільно (кожні ~6% висоти),
// тож у будь-який момент у в'юпорті видно 2–3 плями. Батьківський контейнер у
// layout має position: relative.

type Blob = {
  top: string;
  side: "l" | "r";
  color: "brand" | "violet";
  anim: "anim-drift" | "anim-drift2" | "anim-drift3";
  size: string;
};

// Щільний рядок плям згори донизу, з чергуванням боку/кольору/анімації.
const TOPS = [1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61, 67, 73, 79, 85, 91];
const ANIMS = ["anim-drift", "anim-drift2", "anim-drift3"] as const;
const SIZES = ["36rem", "32rem", "34rem", "38rem"];

const BLOBS: Blob[] = TOPS.map((top, i) => ({
  top: `${top}%`,
  side: i % 2 === 0 ? "r" : "l",
  color: i % 2 === 0 ? "brand" : "violet",
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
          className={`${b.anim} absolute rounded-full blur-[140px] ${
            b.color === "brand" ? "bg-brand/20" : "bg-violet-500/18"
          }`}
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
