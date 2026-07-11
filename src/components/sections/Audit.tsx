"use client";

import { Check, FileSearch, Gauge, Route, Calculator, type LucideIcon } from "lucide-react";
import { Button } from "@/components/landing-ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track } from "@/lib/analytics";
import { useContent } from "@/components/ContentProvider";

const cardIcons: LucideIcon[] = [FileSearch, Gauge, Route, Calculator];

export function Audit() {
  const { openLead } = useLeadModal();
  const { audit } = useContent();

  const openAudit = () => {
    track("audit_request_click", { source: "audit_audit" });
    openLead({
      title: audit.cta,
      description: "Знайдемо втрати бюджету та точки масштабування.",
      source: "audit",
      submitLabel: audit.cta,
    });
  };

  const openCalc = () => {
    track("audit_calc_click", { source: "audit_calc" });
    openLead({
      title: audit.ctaSecondary,
      description: "Прогноз бюджету, вартості заявок і GEO під цілі бізнесу.",
      source: "audit_calc",
      submitLabel: audit.ctaSecondary,
    });
  };

  return (
    <section id="audit" className="section">
      <div className="container-x">
        <div className="reveal max-w-2xl">
          <h2 className="h2">{audit.title}</h2>
        </div>

        <div className="reveal-stagger mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
          {audit.items.map((item, i) => {
            const Icon = cardIcons[i] ?? FileSearch;
            return (
              <article
                key={item.name}
                className="rounded-2xl border border-bg-line bg-bg-card p-4 shadow-card transition-transform duration-300 ease-out will-change-transform hover:scale-[1.02] sm:p-6"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 ring-1 ring-brand/30 sm:h-11 sm:w-11">
                  <Icon className="h-4 w-4 text-brand sm:h-5 sm:w-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-snug text-white sm:mt-4 sm:text-lg">
                  {item.name}
                </h3>
                <p className="mt-1 text-xs text-white/55 sm:mt-1.5 sm:text-sm">{item.desc}</p>
                <ul className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
                  {item.points.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-1.5 text-xs text-white/70 sm:gap-2 sm:text-sm"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand sm:h-4 sm:w-4" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={openAudit}>
            {audit.cta}
          </Button>
          <Button size="lg" variant="secondary" onClick={openCalc}>
            {audit.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
