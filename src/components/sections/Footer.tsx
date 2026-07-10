"use client";

import { Check, Send, Mail, Phone } from "lucide-react";
import { Logo } from "@/components/landing-ui/Logo";
import { useContent } from "@/components/ContentProvider";
import { track } from "@/lib/analytics";
import { nav } from "@/config/site";

const approach = [
  "Чесна комунікація",
  "Фокус на ROI",
  "Прозора звітність",
  "Постійне навчання",
  "Довгострокове партнерство",
];

export function Footer() {
  const { site } = useContent();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-bg-line bg-bg-soft/50">
      <div className="container-x py-12 lg:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.1fr]">
          {/* Про нас */}
          <div className="max-w-sm">
            <Logo className="text-xl" />
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              VRK Partners — команда спеціалістів з Google Ads, performance
              marketing та аналітики.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-white/35">
              Наш підхід
            </p>
            <ul className="mt-2 space-y-1.5">
              {approach.map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm text-white/55">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Навігація */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
              Навігація
            </p>
            <nav className="mt-3 flex flex-col gap-2.5" aria-label="Навігація у футері">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="btn-focus w-fit rounded text-base font-medium text-white/70 transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Контакти */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
              Контакти
            </p>
            <div className="mt-3 space-y-3">
              <a
                href={site.telegram}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("contacts_telegram_click", { source: "footer_telegram" })}
                className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/70 transition-colors hover:text-brand"
              >
                <Send className="h-4 w-4 shrink-0 text-brand" />
                {site.telegramHandle}
              </a>
              <a
                href={`mailto:${site.email}`}
                onClick={() => track("contacts_email_click", { source: "footer_email" })}
                className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/70 transition-colors hover:text-brand"
              >
                <Mail className="h-4 w-4 shrink-0 text-brand" />
                {site.email}
              </a>
              <a
                href={site.phoneHref}
                onClick={() => track("contacts_phone_click", { source: "footer_phone" })}
                className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/70 transition-colors hover:text-brand"
              >
                <Phone className="h-4 w-4 shrink-0 text-brand" />
                {site.phone}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-bg-line pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}. Усі права захищені.
          </p>
          <p>Офіційний Google Partner · performance-маркетинг</p>
        </div>
      </div>
    </footer>
  );
}
