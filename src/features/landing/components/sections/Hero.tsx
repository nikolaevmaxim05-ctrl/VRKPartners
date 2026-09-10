"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { PartnersMarquee } from "@/features/landing/components/layout/PartnersMarquee";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useContent } from "@/features/landing/components/layout/ContentProvider";
import { track } from "@/shared/lib/analytics";

export function Hero() {
  const { openLead } = useLeadModal();
  const { hero } = useContent();

  const handleConsult = () => {
    track("hero_consult_cta_click", { source: "hero_consult" });
    openLead({
      title: hero.primaryCta,
      description: hero.formNote,
      source: "hero",
      submitLabel: "Надіслати заявку",
    });
  };

  const handleAudit = () => {
    track("hero_audit_cta_click", { source: "hero_audit" });
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
      <div className="container-x relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-12">
        <div className="min-w-0 animate-fade-up">
          <h1 className="text-[1.7rem] font-bold leading-[1.15] sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
            {hero.title}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:mt-5 sm:text-lg">
            {hero.subtitle}
          </p>

          {hero.trustHref ? (
            <a
              href={hero.trustHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-bg-line bg-bg-soft/60 px-3.5 py-1.5 text-xs font-semibold text-white/90 transition-colors hover:border-brand/50 hover:text-white sm:mt-6 sm:px-4 sm:py-2 sm:text-sm"
            >
              <span className="h-2 w-2 animate-pulse-glow rounded-full bg-brand" />
              {hero.trust}
            </a>
          ) : (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-bg-line bg-bg-soft/60 px-3.5 py-1.5 text-xs font-semibold text-white/90 sm:mt-6 sm:px-4 sm:py-2 sm:text-sm">
              <span className="h-2 w-2 animate-pulse-glow rounded-full bg-brand" />
              {hero.trust}
            </p>
          )}

          {/* Пара головних CTA у ряд; Telegram-кнопка — окремим повноширинним
              рядком під ними (три lg-кнопки не влазять у колонку hero). На мобільному
              все — стовпчик на всю ширину, Telegram останньою. */}
          <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap">
            <Button size="lg" onClick={handleConsult} className="sm:flex-1">
              {hero.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="secondary" onClick={handleAudit} className="sm:flex-1">
              {hero.secondaryCta}
            </Button>
            <TelegramCtaButton placement="hero" size="lg" className="w-full" />
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

          <div className="relative z-10 overflow-hidden rounded-2xl border border-bg-line bg-bg-card/90 p-6 shadow-card backdrop-blur sm:p-8">
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              {hero.partnerBadge && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero.partnerBadge}
                  alt="Google Partner"
                  className="h-24 w-24 shrink-0 rounded-2xl bg-white object-contain p-1 sm:h-28 sm:w-28"
                />
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-white sm:text-xl">
                  {hero.partnerTitle}
                </p>
                {hero.trustHref && (
                  <a
                    href={hero.trustHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand"
                  >
                    {hero.partnerLinkText}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
