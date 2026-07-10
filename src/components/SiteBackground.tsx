// Єдиний монолітний анімований фон усього лендингу.
// Absolute-шар на всю висоту сторінки: плями «аврора» рознесені по вертикалі,
// тож рухаються РАЗОМ зі скролом. Тонка сітка — по всій сторінці.
// Батьківський контейнер у layout має position: relative.
export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="anim-drift absolute right-[-8%] top-[2%] h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-[140px]" />
      <div className="anim-drift2 absolute left-[-10%] top-[20%] h-[30rem] w-[30rem] rounded-full bg-violet-500/12 blur-[140px]" />
      <div className="anim-drift absolute right-[3%] top-[40%] h-[32rem] w-[32rem] rounded-full bg-brand/12 blur-[150px]" />
      <div className="anim-drift2 absolute left-[6%] top-[58%] h-[28rem] w-[28rem] rounded-full bg-violet-500/12 blur-[140px]" />
      <div className="anim-drift absolute right-[-6%] top-[76%] h-[32rem] w-[32rem] rounded-full bg-brand/10 blur-[150px]" />
      <div className="anim-drift2 absolute left-[10%] top-[92%] h-[26rem] w-[26rem] rounded-full bg-violet-500/10 blur-[140px]" />

      <div className="absolute inset-0 bg-grid-faint opacity-[0.18] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]" />
    </div>
  );
}
