"use client";

import * as React from "react";
import { Menu, X, Phone } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { nav, site } from "@/config/site";
import { cn } from "@/lib/utils";

export function Header() {
  const { openLead } = useLeadModal();
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
    track(analyticsEvents.ctaClick, { source: "header" });
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
                href={item.href}
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
          <a
            href={site.phoneHref}
            onClick={() => track(analyticsEvents.ctaClick, { source: "header_phone" })}
            className="btn-focus inline-flex items-center gap-2 rounded-lg text-[15px] font-semibold tracking-wide text-white transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
              <Phone className="h-4 w-4 text-brand" />
            </span>
            {site.phone}
          </a>
          <Button size="sm" onClick={handleConsult}>
            Консультація
          </Button>
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

      {open && (
        <div className="border-t border-bg-line bg-bg/95 backdrop-blur-md md:hidden">
          <nav className="container-x flex flex-col gap-1 py-4" aria-label="Мобільна навігація">
            {nav.map((item) => {
              const isActive = active === item.href.replace("#", "");
              return (
                <a
                  key={item.href}
                  href={item.href}
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
            <a
              href={site.phoneHref}
              onClick={() => {
                track(analyticsEvents.ctaClick, { source: "header_phone" });
                setOpen(false);
              }}
              className="btn-focus mt-1 inline-flex items-center gap-2 rounded-lg px-2 py-2.5 text-base font-semibold text-white transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
                <Phone className="h-4 w-4 text-brand" />
              </span>
              {site.phone}
            </a>
            <Button
              className="mt-2"
              onClick={() => {
                setOpen(false);
                handleConsult();
              }}
            >
              Отримати консультацію
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
