"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { PartnersMarquee } from "@/features/landing/components/layout/PartnersMarquee";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { track } from "@/shared/lib/analytics";
import { hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";

export function Hero() {
  const { openLead } = useLeadModal();
  const { hero } = useSiteMessages();
  const partners = hero.partners.filter((p) => hasText(p.logo));

  const handleConsult = () => {
    track("hero_consult_cta_click", { source: "hero_consult" });
    openLead({
      title: hero.primaryCta,
      description: hero.formNote,
      source: "hero",
      submitLabel: hero.submitLabel,
    });
  };

  const handleAudit = () => {
    track("hero_audit_cta_click", { source: "hero_audit" });
    openLead({
      title: hero.auditModalTitle,
      description: hero.auditModalDescription,
      source: "hero_audit",
      submitLabel: hero.auditSubmitLabel,
    });
  };

  return (
    <section
      id="top"
      className="sect-sep relative overflow-hidden pt-24 pb-14 sm:pt-32 lg:pt-36 lg:pb-24"
    >
      <div className="container-x relative grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-12">
        <div className="min-w-0 animate-fade-up">
          <h1 data-fit="hero" className="text-[1.7rem] font-bold leading-[1.15] sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
            {nbHyphen(hero.title)}
          </h1>

          {hasText(hero.subtitle) && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:mt-5 sm:text-lg">
              {hero.subtitle}
            </p>
          )}

          {hasText(hero.trust) &&
            (hero.trustHref ? (
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
            ))}

          {/* Пара головних CTA у ряд; Telegram-кнопка — окремим повноширинним
              рядком під ними (три lg-кнопки не влазять у колонку hero). На мобільному
              все — стовпчик на всю ширину, Telegram останньою. */}
          <div data-fit-buttons className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap">
            {hasText(hero.primaryCta) && (
              <Button size="lg" onClick={handleConsult} className="sm:flex-1">
                {hero.primaryCta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {hasText(hero.secondaryCta) && (
              <Button size="lg" variant="secondary" onClick={handleAudit} className="sm:flex-1">
                {hero.secondaryCta}
              </Button>
            )}
            <TelegramCtaButton placement="hero" size="lg" className="w-full" />
          </div>

        </div>

        {/* форма + анімований візуал */}
        <div id="lead" className="relative min-w-0 animate-fade-up [animation-delay:120ms]">
          {/* партнери — слайдер логотипів над формою */}
          {partners.length > 0 && (
            <div className="relative z-10 mb-6">
              {hasText(hero.partnersTitle) && (
                <p className="text-xs uppercase tracking-widest text-white/35">
                  {hero.partnersTitle}
                </p>
              )}
              <PartnersMarquee partners={partners} className="mt-3" />
            </div>
          )}

          <div className="relative z-10 overflow-hidden rounded-2xl border border-bg-line bg-bg-card/90 p-6 shadow-card backdrop-blur sm:p-8">
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              {hero.partnerBadge && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero.partnerBadge}
                  alt={hero.partnerBadgeAlt}
                  className="h-24 w-24 shrink-0 rounded-2xl bg-white object-contain p-1 sm:h-28 sm:w-28"
                />
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-white sm:text-xl">
                  {hero.partnerTitle}
                </p>
                {hero.trustHref && hasText(hero.partnerLinkText) && (
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
