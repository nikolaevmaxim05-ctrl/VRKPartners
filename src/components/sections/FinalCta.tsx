"use client";

import * as React from "react";
import { Plus, Minus, Send, Mail, Phone, Globe, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { finalCta, faq, site } from "@/config/site";
import { cn } from "@/lib/utils";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl border border-bg-line bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
  );
}

export function FinalCta() {
  const { openLead } = useLeadModal();

  const openForm = () => {
    track(analyticsEvents.ctaClick, { source: "final" });
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
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          {/* Ліворуч: заклик + FAQ + контакти */}
          <div className="reveal">
            <span className="eyebrow">{finalCta.eyebrow}</span>
            <h2 className="h2 mt-4">{finalCta.title}</h2>
            <p className="mt-4 text-lg text-white/60">{finalCta.text}</p>

            <div id="faq" className="mt-8 scroll-mt-24 space-y-3">
              {faq.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>

            {/* контакти */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <a
                href={site.telegram}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track(analyticsEvents.ctaClick, { source: "contacts_telegram" })}
                className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
              >
                <Send className="h-5 w-5 text-brand" />
                <span className="text-sm">
                  <span className="block text-white/45">Telegram</span>
                  <span className="font-medium text-white">{site.telegramHandle}</span>
                </span>
              </a>
              <a
                href={`mailto:${site.email}`}
                className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
              >
                <Mail className="h-5 w-5 text-brand" />
                <span className="text-sm">
                  <span className="block text-white/45">Email</span>
                  <span className="font-medium text-white">{site.email}</span>
                </span>
              </a>
              <a
                href={site.phoneHref}
                className="btn-focus flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4 transition-colors hover:border-brand/40"
              >
                <Phone className="h-5 w-5 text-brand" />
                <span className="text-sm">
                  <span className="block text-white/45">Телефон</span>
                  <span className="font-medium text-white">{site.phone}</span>
                </span>
              </a>
              <div className="flex items-center gap-3 rounded-xl border border-bg-line bg-bg-card p-4">
                <Globe className="h-5 w-5 text-brand" />
                <span className="text-sm">
                  <span className="block text-white/45">Формат роботи</span>
                  <span className="font-medium text-white">{site.geo}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Праворуч: заклик + кнопка (форма — у першому блоці) */}
          <div className="reveal lg:sticky lg:top-24">
            <div className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 shadow-card sm:p-8">
              <h3 className="text-2xl font-bold text-white">{finalCta.primaryCta}</h3>
              <p className="mt-2 text-sm text-white/65">
                Проаналізуємо вашу задачу та підкажемо, з чого почати: аудит,
                стратегія, запуск або масштабування Google Ads.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button size="lg" onClick={openForm}>
                  {finalCta.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <a href={site.telegram} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="secondary" className="w-full">
                    <Send className="h-4 w-4" />
                    {finalCta.telegramCta}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
