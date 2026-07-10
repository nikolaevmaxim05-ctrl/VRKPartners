"use client";

import * as React from "react";
import { Plus, Minus, Send, Mail, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/landing-ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { useContent } from "@/components/ContentProvider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      {/* м'яке свічення ПОЗАДУ питання — плавно з'являється при відкритті */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -inset-1 rounded-2xl bg-white/15 blur-2xl transition-opacity duration-300 ease-out",
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

export function FinalCta() {
  const { openLead } = useLeadModal();
  const { finalCta, faq, site } = useContent();

  const openForm = () => {
    track("final_cta_click", { source: "final" });
    openLead({
      title: finalCta.primaryCta,
      description: "Проаналізуємо вашу задачу та підкажемо, з чого почати.",
      source: "final",
      submitLabel: "Отримати відповідь",
    });
  };

  return (
    <section id="contacts" className="section">
      <div className="container-x">
        {/* Заголовок */}
        <div className="reveal mx-auto max-w-3xl text-center">
          <h2 className="h2">{finalCta.title}</h2>
          <p className="mt-4 text-lg text-white/60">{finalCta.text}</p>
        </div>

        {/* FAQ — у дві колонки на десктопі */}
        <div
          id="faq"
          className="reveal mx-auto mt-10 grid max-w-5xl scroll-mt-24 gap-3 lg:grid-cols-2 lg:items-start"
        >
          {faq.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>

        {/* Контакти */}
        <div className="reveal mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href={site.telegram}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("contacts_telegram_click", { source: "contacts_telegram" })}
            className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
          >
            <Send className="h-5 w-5 shrink-0 text-brand" />
            <span className="text-sm">
              <span className="block text-white/45">Telegram</span>
              <span className="font-medium text-white">{site.telegramHandle}</span>
            </span>
          </a>
          <a
            href={`mailto:${site.email}`}
            onClick={() => track("contacts_email_click", { source: "contacts_email" })}
            className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
          >
            <Mail className="h-5 w-5 shrink-0 text-brand" />
            <span className="text-sm">
              <span className="block text-white/45">Email</span>
              <span className="font-medium text-white">{site.email}</span>
            </span>
          </a>
          <a
            href={site.phoneHref}
            onClick={() => track("contacts_phone_click", { source: "contacts_phone" })}
            className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
          >
            <Phone className="h-5 w-5 shrink-0 text-brand" />
            <span className="text-sm">
              <span className="block text-white/45">Телефон</span>
              <span className="font-medium text-white">{site.phone}</span>
            </span>
          </a>
        </div>

        {/* Нижній CTA */}
        <div className="reveal mx-auto mt-12 max-w-3xl rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 text-center shadow-card sm:p-8">
          <h3 className="text-2xl font-bold text-white">{finalCta.primaryCta}</h3>
          <div className="mt-6 flex justify-center">
            <Button size="lg" onClick={openForm}>
              {finalCta.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
