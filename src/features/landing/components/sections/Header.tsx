"use client";

import * as React from "react";
import { Menu, X, Phone } from "lucide-react";
import { Logo } from "@/features/landing/components/ui/Logo";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { usePathname } from "next/navigation";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useContent } from "@/features/landing/components/layout/ContentProvider";
import { CopyContactLink } from "@/shared/ui/copy-contact-link";
import { track } from "@/shared/lib/analytics";
import { nav, navHref } from "@/shared/config/site";
import { cn } from "@/shared/lib/utils";

export function Header() {
  const { openLead } = useLeadModal();
  const { site } = useContent();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [active, setActive] = React.useState("");

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy: активна — остання секція, чий верх перетнув лінію ~35% висоти вікна.
  // Позиційний розрахунок дає неперервну підсвітку без «мертвих зон» між секціями.
  React.useEffect(() => {
    const ids = nav.map((n) => n.href.replace("#", ""));

    const compute = () => {
      const line = window.scrollY + window.innerHeight * 0.35;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= line) {
          current = id;
        }
      }
      setActive(current);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  const handleConsult = () => {
    track("header_cta_click", { source: "header" });
    openLead({
      title: "Отримати консультацію",
      description: "Залиште контакти — зв'яжемося та підкажемо наступний крок.",
      source: "header",
      submitLabel: "Отримати консультацію",
    });
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all",
        scrolled
          ? "border-b border-bg-line bg-bg/80 backdrop-blur-md"
          : "border-b border-transparent"
      )}
    >
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="btn-focus rounded-lg text-2xl transition-all duration-300 hover:[text-shadow:0_0_16px_rgba(246,247,64,0.6)]"
          aria-label="VRK Partners — на початок"
        >
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Головна навігація">
          {nav.map((item) => {
            const isActive = active === item.href.replace("#", "");
            return (
              <a
                key={item.href}
                href={navHref(item.href, pathname)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "btn-focus rounded text-sm font-medium transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]",
                  isActive
                    ? "text-brand [text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
                    : "text-white/70"
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <CopyContactLink
            value={site.phone}
            type="phone"
            href={site.phoneHref}
            onClick={() => track("header_phone_click", { source: "header_phone" })}
            className="btn-focus inline-flex items-center gap-2 rounded-lg text-[17px] font-bold tracking-normal text-white transition-all duration-300 [font-family:system-ui,'Segoe_UI',Roboto,Arial,sans-serif] [font-variant-numeric:tabular-nums] hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
              <Phone className="h-4 w-4 text-brand" />
            </span>
            {site.phone}
          </CopyContactLink>
          <Button size="sm" onClick={handleConsult}>
            Консультація
          </Button>
          <TelegramCtaButton placement="header" size="sm" iconOnly />
        </div>

        <button
          type="button"
          className="btn-focus rounded-lg p-2 text-white md:hidden"
          aria-label={open ? "Закрити меню" : "Відкрити меню"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div
        aria-hidden={!open}
        className={cn(
          "grid overflow-hidden border-t bg-bg/95 backdrop-blur-md transition-all duration-300 ease-in-out md:hidden",
          open
            ? "grid-rows-[1fr] border-bg-line opacity-100"
            : "grid-rows-[0fr] border-transparent opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <nav className="container-x flex flex-col gap-1 py-4" aria-label="Мобільна навігація">
            {nav.map((item) => {
              const isActive = active === item.href.replace("#", "");
              return (
                <a
                  key={item.href}
                  href={navHref(item.href, pathname)}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "btn-focus rounded-lg px-2 py-2.5 text-base font-medium transition-all duration-300 hover:bg-white/5 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]",
                    isActive
                      ? "text-brand [text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
                      : "text-white/80"
                  )}
                >
                  {item.label}
                </a>
              );
            })}
            <CopyContactLink
              value={site.phone}
              type="phone"
              href={site.phoneHref}
              onClick={() => {
                track("header_phone_click", { source: "header_phone" });
                setOpen(false);
              }}
              className="btn-focus mt-1 inline-flex items-center gap-2 rounded-lg px-2 py-2.5 text-base font-semibold text-white transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
                <Phone className="h-4 w-4 text-brand" />
              </span>
              {site.phone}
            </CopyContactLink>
            <Button
              className="mt-2"
              onClick={() => {
                setOpen(false);
                handleConsult();
              }}
            >
              Отримати консультацію
            </Button>
            <TelegramCtaButton
              placement="header"
              size="md"
              className="mt-2 w-full"
              onClick={() => setOpen(false)}
            />
          </nav>
        </div>
      </div>
    </header>
  );
}
