"use client";

import { usePathname } from "next/navigation";
import { Check, Send, Mail, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/features/landing/components/ui/Logo";
import { useSiteMessages, useHomeVisibility } from "@/features/landing/lib/messages";
import { navHref } from "@/features/landing/lib/nav";
import { CopyContactLink } from "@/shared/ui/copy-contact-link";
import { track } from "@/shared/lib/analytics";
import { NAV_ITEMS } from "@core/domain/content/visibility";
import { contentList, hasText } from "@core/domain/content/messages";

export function Footer() {
  const { site, footer, nav: navLabels } = useSiteMessages();
  const vis = useHomeVisibility();
  const pathname = usePathname();
  const year = new Date().getFullYear();
  // Ссылка на скрытый блок не выводится нигде (раздел 9).
  const nav = NAV_ITEMS.filter((item) => vis.shown(item.id) && navLabels[item.id].trim() !== "");
  const approach = contentList(footer.approach);
  return (
    <footer className="border-t border-bg-line bg-bg-soft/50">
      <div className="container-x py-12 lg:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* О нас */}
          <div className="max-w-sm">
            <Logo className="text-xl" />
            {hasText(footer.description) && (
              <p className="mt-4 text-sm leading-relaxed text-white/55">{footer.description}</p>
            )}
            {approach.length > 0 && (
              <>
                {hasText(footer.approachTitle) && (
                  <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-white/35">
                    {footer.approachTitle}
                  </p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {approach.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/55">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Навигация */}
          {nav.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
                {footer.navTitle}
              </p>
              <nav className="mt-3 flex flex-col gap-2.5" aria-label={footer.navAria}>
                {nav.map((item) => (
                  <a
                    key={item.anchor}
                    href={navHref(item.anchor, pathname)}
                    className="btn-focus w-fit rounded text-base font-medium text-white/70 transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
                  >
                    {navLabels[item.id]}
                  </a>
                ))}
              </nav>
            </div>
          )}

          {/* Контакты */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
              {footer.contactsTitle}
            </p>
            <div className="mt-3 space-y-3">
              {hasText(site.telegram) && hasText(site.telegramHandle) && (
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
              )}
              {hasText(site.email) && (
                <CopyContactLink
                  value={site.email}
                  type="email"
                  href={`mailto:${site.email}`}
                  onClick={() => track("contacts_email_click", { source: "footer_email" })}
                  className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/70 transition-colors hover:text-brand"
                >
                  <Mail className="h-4 w-4 shrink-0 text-brand" />
                  {site.email}
                </CopyContactLink>
              )}
              {hasText(site.phone) && (
                <CopyContactLink
                  value={site.phone}
                  type="phone"
                  href={site.phoneHref}
                  onClick={() => track("contacts_phone_click", { source: "footer_phone" })}
                  className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/70 transition-colors hover:text-brand"
                >
                  <Phone className="h-4 w-4 shrink-0 text-brand" />
                  {site.phone}
                </CopyContactLink>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-bg-line pt-6">
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs"
            aria-label={footer.legalNavAria}
          >
            <Link
              href="/polityka-konfidentsiynosti"
              className="btn-focus rounded text-white/50 transition-colors hover:text-brand"
            >
              {footer.privacy}
            </Link>
            <Link
              href="/publichna-oferta"
              className="btn-focus rounded text-white/50 transition-colors hover:text-brand"
            >
              {footer.offer}
            </Link>
          </nav>
          <div className="mt-4 flex flex-col gap-2 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {year} {site.name}. {footer.rights}
            </p>
            {hasText(footer.tagline) && <p>{footer.tagline}</p>}
          </div>
        </div>
      </div>
    </footer>
  );
}
