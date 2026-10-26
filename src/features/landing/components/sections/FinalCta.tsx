"use client";

import * as React from "react";
import { Plus, Minus, Send, Mail, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useSiteMessages, useHomeVisibility } from "@/features/landing/lib/messages";
import { CopyContactLink } from "@/shared/ui/copy-contact-link";
import { track } from "@/shared/lib/analytics";
import { hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";
import { cn } from "@/shared/lib/utils";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      {/* м'яке свічення ПОЗАДУ питання — плавно з'являється при відкритті */}
      <div
        aria-hidden="true"
        className={cn(
          "fx-glow pointer-events-none absolute -inset-1 rounded-2xl bg-white/15 blur-2xl transition-opacity duration-300 ease-out",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div className="relative rounded-xl border border-bg-line bg-bg-card transition-colors duration-300">
        <button
          type="button"
          onClick={() => {
            // трекаємо лише розкриття (не згортання)
            if (!open) track("faq_open", { question: q });
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="btn-focus flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left"
        >
          <span className="font-medium text-white">{q}</span>
          {open ? (
            <Minus className="h-5 w-5 shrink-0 text-brand" />
          ) : (
            <Plus className="h-5 w-5 shrink-0 text-brand" />
          )}
        </button>
        <div
          className={cn(
            "grid overflow-hidden transition-all duration-300",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <p className="px-5 pb-4 text-sm leading-relaxed text-white/60">{a}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Одна секція сайту (#contacts) з двома приховуваними блоками: `finalCta` (заголовок, контакти,
// нижній CTA) і `faq` (питання). Приховане не потрапляє в DOM; секцію без обох блоків не
// рендерить page.tsx.
export function FinalCta({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { openLead } = useLeadModal();
  const { finalCta, faq, site } = useSiteMessages();
  const vis = useHomeVisibility();
  const showCta = vis.shown("finalCta");
  const questions = faq.filter((f) => hasText(f.q));
  const showFaq = vis.shown("faq") && questions.length > 0;

  const openForm = () => {
    track("final_cta_click", { source: "final" });
    openLead({
      title: finalCta.primaryCta,
      description: finalCta.modalDescription,
      source: "final",
      submitLabel: finalCta.submitLabel,
    });
  };

  return (
    <section id="contacts" className="section">
      <div className="container-x">
        {/* Заголовок */}
        {showCta && (
          <div className="reveal mx-auto max-w-3xl text-center">
            <Title data-fit className="h2">{nbHyphen(finalCta.title)}</Title>
            {hasText(finalCta.text) && <p className="mt-4 text-lg text-white/60">{finalCta.text}</p>}
          </div>
        )}

        {/* FAQ — у дві колонки на десктопі */}
        {showFaq && (
          <div
            id="faq"
            className={cn(
              "reveal mx-auto grid max-w-5xl scroll-mt-24 gap-3 lg:grid-cols-2 lg:items-start",
              showCta && "mt-10"
            )}
          >
            {questions.map((f, i) => (
              <FaqItem key={i} q={f.q} a={f.a} />
            ))}
          </div>
        )}

        {showCta && (
          <>
            {/* Контакти */}
            <div data-items={[site.telegram, site.email, site.phone].filter(hasText).length} className="reveal mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hasText(site.telegram) && (
                <a
                  href={site.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("contacts_telegram_click", { source: "contacts_telegram" })}
                  className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
                >
                  <Send className="h-5 w-5 shrink-0 text-brand" />
                  <span className="text-sm">
                    <span className="block text-white/45">{finalCta.telegramLabel}</span>
                    <span className="font-medium text-white">{site.telegramHandle}</span>
                  </span>
                </a>
              )}
              {hasText(site.email) && (
                <CopyContactLink
                  value={site.email}
                  type="email"
                  href={`mailto:${site.email}`}
                  onClick={() => track("contacts_email_click", { source: "contacts_email" })}
                  className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
                >
                  <Mail className="h-5 w-5 shrink-0 text-brand" />
                  <span className="text-sm">
                    <span className="block text-white/45">{finalCta.emailLabel}</span>
                    <span className="font-medium text-white">{site.email}</span>
                  </span>
                </CopyContactLink>
              )}
              {hasText(site.phone) && (
                <CopyContactLink
                  value={site.phone}
                  type="phone"
                  href={site.phoneHref}
                  onClick={() => track("contacts_phone_click", { source: "contacts_phone" })}
                  className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
                >
                  <Phone className="h-5 w-5 shrink-0 text-brand" />
                  <span className="text-sm">
                    <span className="block text-white/45">{finalCta.phoneLabel}</span>
                    <span className="font-medium text-white">{site.phone}</span>
                  </span>
                </CopyContactLink>
              )}
            </div>

            {/* Нижній CTA */}
            {hasText(finalCta.primaryCta) && (
              <div className="reveal mx-auto mt-12 max-w-3xl rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 text-center shadow-card sm:p-8">
                <h3 data-fit className="text-2xl font-bold text-white">{nbHyphen(finalCta.primaryCta)}</h3>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                  <Button size="lg" onClick={openForm}>
                    {finalCta.primaryCta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <TelegramCtaButton placement="final" size="lg" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
