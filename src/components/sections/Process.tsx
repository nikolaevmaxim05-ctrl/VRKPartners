"use client";

import { Button } from "@/components/ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { workflow } from "@/config/site";

export function Process() {
  const { openLead } = useLeadModal();

  const handleBonus = () => {
    track(analyticsEvents.ctaClick, { source: "google_bonus" });
    openLead({
      title: workflow.bonus.cta,
      description: workflow.bonus.desc,
      source: "google_bonus",
      submitLabel: workflow.bonus.cta,
    });
  };

  return (
    <section id="process" className="section bg-bg-soft/40">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          <h2 className="h2">{workflow.title}</h2>
        </div>

        {/* Мобільний: компактний вертикальний таймлайн */}
        <ol className="reveal-stagger relative ml-3 mt-8 space-y-4 border-l-2 border-bg-line lg:hidden">
          {workflow.steps.map((step) => (
            <li key={step.n} className="relative flex min-h-[1.75rem] items-center pl-6">
              <span className="absolute left-0 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-ink ring-4 ring-bg-soft">
                {step.n}
              </span>
              <h3 className="text-sm font-semibold leading-snug text-white">{step.title}</h3>
            </li>
          ))}
        </ol>

        {/* Десктоп: горизонтальний таймлайн */}
        <ol className="reveal-stagger relative mt-14 hidden grid-cols-7 lg:grid">
          <div
            className="absolute left-[7%] right-[7%] top-5 h-0.5 bg-bg-line"
            aria-hidden="true"
          />
          {workflow.steps.map((step) => (
            <li key={step.n} className="relative flex flex-col items-center px-2 text-center">
              <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink ring-4 ring-bg-soft">
                {step.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold leading-snug text-white">
                {step.title}
              </h3>
            </li>
          ))}
        </ol>

        {/* Підблок: бонус від Google */}
        <div className="reveal mt-12 overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <h3 className="text-2xl font-bold text-white">{workflow.bonus.title}</h3>
              <p className="mt-2 max-w-2xl text-sm text-white/65">{workflow.bonus.desc}</p>

              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                {workflow.bonus.terms.map((t) => (
                  <div key={t.label} className="rounded-xl border border-bg-line bg-bg-soft p-3">
                    <dt className="text-xs uppercase tracking-wide text-white/40">{t.label}</dt>
                    <dd className="mt-1 text-sm font-medium text-white/85">{t.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Button size="lg" onClick={handleBonus} className="w-full lg:w-auto">
              {workflow.bonus.cta}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
