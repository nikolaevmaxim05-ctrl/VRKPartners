"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/landing-ui/Button";
import { LeadForm } from "@/components/LeadForm";
import { PartnersMarquee } from "@/components/PartnersMarquee";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { hero } from "@/config/site";

export function Hero() {
  const { openLead } = useLeadModal();

  const handleConsult = () => {
    track(analyticsEvents.ctaClick, { source: "hero_consult" });
    openLead({
      title: hero.primaryCta,
      description: hero.formNote,
      source: "hero",
      submitLabel: "Надіслати заявку",
    });
  };

  const handleAudit = () => {
    track(analyticsEvents.ctaClick, { source: "hero_audit" });
    openLead({
      title: "Замовити аудит Google Ads",
      description: "Знайдемо втрати бюджету та точки росту.",
      source: "hero_audit",
      submitLabel: "Замовити аудит",
    });
  };

  return (
    <section
      id="top"
      className="relative overflow-hidden pt-24 pb-14 sm:pt-32 lg:pt-36 lg:pb-24"
    >
      {/* фонові ефекти: рухливі «аврора»-плями + сітка */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 right-[-12%] h-[30rem] w-[30rem] rounded-full bg-brand/20 blur-[130px] anim-drift" />
        <div className="absolute bottom-[-25%] left-[-12%] h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-[130px] anim-drift2" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/10 blur-[120px] anim-drift" />
        <div className="absolute inset-0 bg-grid-faint [background-size:64px_64px] opacity-40 [mask-image:radial-gradient(70%_50%_at_50%_0%,black,transparent)]" />
      </div>

      <div className="container-x relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-12">
        <div className="min-w-0 animate-fade-up">
          <h1 className="text-[1.7rem] font-bold leading-[1.15] sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
            {hero.title}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:mt-5 sm:text-lg">
            {hero.subtitle}
          </p>

          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-bg-line bg-bg-soft/60 px-3.5 py-1.5 text-xs text-white/80 sm:mt-6 sm:px-4 sm:py-2 sm:text-sm">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-brand" />
            {hero.trust}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row">
            <Button size="lg" onClick={handleConsult}>
              {hero.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="secondary" onClick={handleAudit}>
              {hero.secondaryCta}
            </Button>
          </div>

        </div>

        {/* форма + анімований візуал */}
        <div id="lead" className="relative min-w-0 animate-fade-up [animation-delay:120ms]">
          {/* партнери — слайдер логотипів над формою */}
          <div className="relative z-10 mb-6">
            <p className="text-xs uppercase tracking-widest text-white/35">
              Наші партнери
            </p>
            <PartnersMarquee className="mt-3" />
          </div>

          {/* обертовий ореол за формою */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-24 hidden lg:block" aria-hidden="true">
            <div className="anim-spin-slow absolute inset-0 rounded-[2.5rem] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(246,247,64,0.22)_70deg,transparent_150deg,transparent_360deg)] blur-2xl" />
          </div>

          <div className="relative z-10 rounded-2xl border border-bg-line bg-bg-card/90 p-6 shadow-card backdrop-blur sm:p-7">
            <h2 className="text-xl font-bold text-white">{hero.formTitle}</h2>
            <p className="mt-1 text-sm text-white/55">{hero.formNote}</p>
            <div className="mt-5">
              <LeadForm
                source="hero"
                submitLabel="Надіслати заявку"
                inlineSuccess
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
