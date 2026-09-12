"use client";

import { Check } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { track } from "@/shared/lib/analytics";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { ContentIcon } from "@/features/landing/components/layout/ContentIcon";
import { DEFAULT_AUDIT_ICON_ORDER } from "@/shared/lib/audit-icons";
import { contentList, hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";
import { SplitWords } from "@/shared/lib/split-words";

export function Audit({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { openLead } = useLeadModal();
  const { audit } = useSiteMessages();
  const items = audit.items.filter((it) => hasText(it.name));

  const openAudit = () => {
    track("audit_request_click", { source: "audit_audit" });
    openLead({
      title: audit.cta,
      description: audit.auditModalDescription,
      source: "audit",
      submitLabel: audit.cta,
    });
  };

  const openCalc = () => {
    track("audit_calc_click", { source: "audit_calc" });
    openLead({
      title: audit.ctaSecondary,
      description: audit.calcModalDescription,
      source: "audit_calc",
      submitLabel: audit.ctaSecondary,
    });
  };

  return (
    <section id="audit" className="section">
      <div className="container-x">
        <div className="reveal max-w-2xl">
          <Title data-fit className="h2">{nbHyphen(audit.title)}</Title>
        </div>

        {/* Крок 4 мобільних анімацій: замість появи карток (reveal-stagger) — слова пунктів розгораються
            по мірі прокрутки ([data-word-reveal] → features/landing/lib/word-reveal). Рішення власника:
            виїзд карток прибрано, іконка/назва/опис завжди яскраві. */}
        <div data-items={items.length} data-word-reveal className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
          {items.map((item, i) => {
            return (
              <article
                key={i}
                className="rounded-2xl border border-bg-line bg-bg-card p-4 shadow-card transition-transform duration-75 ease-out will-change-transform hover:!scale-[1.03] sm:p-6"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 ring-1 ring-brand/30 sm:h-11 sm:w-11">
                  <ContentIcon icon={item.icon} index={i} order={DEFAULT_AUDIT_ICON_ORDER} className="h-4 w-4 text-brand sm:h-5 sm:w-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-snug text-white sm:mt-4 sm:text-lg">
                  {item.name}
                </h3>
                {hasText(item.desc) && (
                  <p className="mt-1 text-xs text-white/55 sm:mt-1.5 sm:text-sm">{item.desc}</p>
                )}
                <ul className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
                  {contentList(item.points).map((p, pi) => (
                    <li
                      key={pi}
                      className="flex items-start gap-1.5 text-xs text-white/70 sm:gap-2 sm:text-sm"
                    >
                      <Check data-word-check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand sm:h-4 sm:w-4" />
                      <span>
                        <SplitWords text={p} />
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {hasText(audit.cta) && (
            <Button size="lg" onClick={openAudit}>
              {audit.cta}
            </Button>
          )}
          {hasText(audit.ctaSecondary) && (
            <Button size="lg" variant="secondary" onClick={openCalc}>
              {audit.ctaSecondary}
            </Button>
          )}
          <TelegramCtaButton placement="audit" size="lg" />
        </div>
      </div>
    </section>
  );
}
