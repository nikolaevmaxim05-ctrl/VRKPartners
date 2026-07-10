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
      <div className="anim-drift absolute right-[-6%] top-[1%] h-[36rem] w-[36rem] rounded-full bg-brand/20 blur-[140px]" />
      <div className="anim-drift2 absolute left-[-8%] top-[13%] h-[30rem] w-[30rem] rounded-full bg-violet-500/18 blur-[140px]" />
      <div className="anim-drift3 absolute right-[6%] top-[27%] h-[32rem] w-[32rem] rounded-full bg-brand/16 blur-[150px]" />
      <div className="anim-drift absolute left-[2%] top-[40%] h-[30rem] w-[30rem] rounded-full bg-violet-500/16 blur-[140px]" />
      <div className="anim-drift2 absolute right-[-4%] top-[53%] h-[34rem] w-[34rem] rounded-full bg-brand/16 blur-[150px]" />
      <div className="anim-drift3 absolute left-[8%] top-[66%] h-[28rem] w-[28rem] rounded-full bg-violet-500/16 blur-[140px]" />
      <div className="anim-drift absolute right-[4%] top-[79%] h-[32rem] w-[32rem] rounded-full bg-brand/16 blur-[150px]" />
      <div className="anim-drift2 absolute left-[-6%] top-[92%] h-[28rem] w-[28rem] rounded-full bg-violet-500/14 blur-[140px]" />

      <div className="absolute inset-0 bg-grid-faint opacity-[0.18] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]" />
    </div>
  );
}
