// Єдиний монолітний анімований фон усього лендингу.
// Absolute-шар на всю висоту сторінки: плями «аврора» рухаються РАЗОМ зі скролом.
// Плями притиснуті до лівого/правого краю — їхнє світіння завжди потрапляє в бічні
// поля (гутери), тож видно у кожній секції, а не тільки там, де є вільне місце.
// Батьківський контейнер у layout має position: relative.
export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="anim-drift absolute right-[-10%] top-[1%] h-[38rem] w-[38rem] rounded-full bg-brand/22 blur-[140px]" />
      <div className="anim-drift2 absolute left-[-12%] top-[13%] h-[34rem] w-[34rem] rounded-full bg-violet-500/20 blur-[140px]" />
      <div className="anim-drift3 absolute right-[-12%] top-[26%] h-[36rem] w-[36rem] rounded-full bg-brand/18 blur-[150px]" />
      <div className="anim-drift absolute left-[-12%] top-[39%] h-[34rem] w-[34rem] rounded-full bg-violet-500/18 blur-[140px]" />
      <div className="anim-drift2 absolute right-[-12%] top-[52%] h-[36rem] w-[36rem] rounded-full bg-brand/18 blur-[150px]" />
      <div className="anim-drift3 absolute left-[-12%] top-[65%] h-[34rem] w-[34rem] rounded-full bg-violet-500/18 blur-[140px]" />
      <div className="anim-drift absolute right-[-10%] top-[78%] h-[36rem] w-[36rem] rounded-full bg-brand/18 blur-[150px]" />
      <div className="anim-drift2 absolute left-[-12%] top-[91%] h-[34rem] w-[34rem] rounded-full bg-violet-500/16 blur-[140px]" />

      <div className="absolute inset-0 bg-grid-faint opacity-[0.18] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]" />
    </div>
  );
}
