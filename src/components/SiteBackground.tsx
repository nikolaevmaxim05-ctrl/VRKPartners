// Єдиний монолітний анімований фон усього лендингу.
// Fixed-шар за контентом: плями «аврора» + тонка сітка. Один на всю сторінку —
// без «швів» і переходів між блоками. Секції прозорі, тож фон видно скрізь.
export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="anim-drift absolute -top-32 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-[140px]" />
      <div className="anim-drift2 absolute left-[-12%] top-1/3 h-[30rem] w-[30rem] rounded-full bg-violet-500/12 blur-[140px]" />
      <div className="anim-drift absolute bottom-[-8%] right-[4%] h-[32rem] w-[32rem] rounded-full bg-brand/10 blur-[150px]" />
      <div className="anim-drift2 absolute bottom-1/4 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-[130px]" />

      <div className="absolute inset-0 bg-grid-faint opacity-25 [background-size:64px_64px] [mask-image:radial-gradient(110%_90%_at_50%_20%,black,transparent)]" />
    </div>
  );
}
