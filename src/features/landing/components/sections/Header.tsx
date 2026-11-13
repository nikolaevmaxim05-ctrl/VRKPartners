"use client";

import * as React from "react";
import { Menu, X, Phone } from "lucide-react";
import { Logo } from "@/features/landing/components/ui/Logo";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { usePathname } from "next/navigation";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useSiteMessages, useHomeVisibility } from "@/features/landing/lib/messages";
import { navHref } from "@/features/landing/lib/nav";
import { CopyContactLink } from "@/shared/ui/copy-contact-link";
import { track } from "@/shared/lib/analytics";
import { NAV_ITEMS } from "@core/domain/content/visibility";
import { cn } from "@/shared/lib/utils";

/** Запас между пунктами меню и правым блоком (px), чтобы порог срабатывал с небольшим люфтом. */
const NAV_SLACK = 24;
/** Промежутки бара (gap-4) между логотипом, меню и правым блоком. */
const BAR_GAPS = 16 * 2;

const PHONE_CLS =
  "btn-focus inline-flex items-center gap-2 whitespace-nowrap rounded-lg text-[17px] font-bold tracking-normal text-white transition-all duration-300 [font-family:system-ui,'Segoe_UI',Roboto,Arial,sans-serif] [font-variant-numeric:tabular-nums] hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]";

function PhoneIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 ring-1 ring-brand/30">
      <Phone className="h-4 w-4 text-brand" />
    </span>
  );
}

export function Header() {
  const { openLead } = useLeadModal();
  const { site, header, nav: navLabels } = useSiteMessages();
  const vis = useHomeVisibility();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [active, setActive] = React.useState("");
  // Порог «меню в бургер» — по сумме ширин пунктов (раздел 12, п. 7), а не по ширине экрана:
  // названия пунктов редактирует клиент. До первого измерения — по CSS-брейкпоинту md.
  const [compact, setCompact] = React.useState<boolean | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const logoRef = React.useRef<HTMLAnchorElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const actionsMeasureRef = React.useRef<HTMLDivElement>(null);

  // Ссылка на скрытый блок не выводится нигде (раздел 9).
  const nav = NAV_ITEMS.filter((item) => vis.shown(item.id) && navLabels[item.id].trim() !== "").map(
    (item) => ({ href: item.anchor, label: navLabels[item.id] })
  );
  const navIds = nav.map((n) => n.href.replace("#", "")).join(",");
  const navKey = nav.map((n) => n.label).join("|");

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Измерение: логотип + сумма ширин пунктов + правый блок (телефон, кнопки) > ширины бара → бургер.
  // Пункты и правый блок меряются НЕВИДИМЫМИ КОПИЯМИ (всегда в потоке): настоящие блоки в
  // компактном состоянии display:none и дали бы 0 — порог «дёргался» бы туда-сюда.
  React.useEffect(() => {
    const measure = () => {
      const bar = barRef.current;
      const items = measureRef.current;
      const actions = actionsMeasureRef.current;
      if (!bar || !items || !actions) return;
      const logoW = logoRef.current?.offsetWidth ?? 0;
      const needed = logoW + items.offsetWidth + actions.offsetWidth + BAR_GAPS + NAV_SLACK;
      // clientWidth бара включает его внутренние отступы (container-x) — сравниваем с контентной шириной.
      const cs = getComputedStyle(bar);
      const available = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setCompact(needed > available);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    window.addEventListener("resize", measure);
    if (typeof document !== "undefined" && "fonts" in document) document.fonts.ready.then(measure).catch(() => {});
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [navKey, site.phone, header.consultShort]);

  // Scrollspy: активная — последняя секция, чей верх пересёк линию ~35% высоты окна.
  React.useEffect(() => {
    const ids = navIds.split(",").filter(Boolean);
    const compute = () => {
      const line = window.scrollY + window.innerHeight * 0.35;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= line) current = id;
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
  }, [navIds]);

  const handleConsult = () => {
    track("header_cta_click", { source: "header" });
    openLead({
      title: header.modalTitle,
      description: header.modalDescription,
      source: "header",
      submitLabel: header.consultCta,
    });
  };

  // compact === null → поведение по брейкпоинту md (до первого измерения / без JS).
  const desktopCls = compact === null ? "hidden md:flex" : compact ? "hidden" : "flex";
  const burgerCls = compact === null ? "md:hidden" : compact ? "" : "hidden";

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        // site-header / data-scrolled — хуки для режима lite (globals.css): без backdrop-filter, фон 95 %.
        "site-header fixed inset-x-0 top-0 z-50 transition-all",
        scrolled
          ? "border-b border-bg-line bg-bg/80 backdrop-blur-md"
          : "border-b border-transparent"
      )}
    >
      <div ref={barRef} className="container-x flex h-16 items-center justify-between gap-4">
        <a
          ref={logoRef}
          href="#top"
          className="btn-focus shrink-0 rounded-lg text-2xl transition-all duration-300 hover:[text-shadow:0_0_16px_rgba(246,247,64,0.6)]"
          aria-label={header.logoAria}
        >
          <Logo />
        </a>

        {/* Невидимые копии пунктов и правого блока для измерения ширин (тот же шрифт/размер/промежутки).
            Внешний блок 0×0 с overflow-hidden — не влияет на раскладку; inert — вне фокуса и a11y. */}
        <div aria-hidden="true" inert className="pointer-events-none absolute left-0 top-0 -z-10 h-0 w-0 overflow-hidden opacity-0">
          <div className="flex w-max items-center">
            <div ref={measureRef} className="flex items-center gap-7 whitespace-nowrap text-sm font-medium">
              {nav.map((item) => (
                <span key={item.href}>{item.label}</span>
              ))}
            </div>
            <div ref={actionsMeasureRef} className="flex items-center gap-4">
              <span className={PHONE_CLS}>
                <PhoneIcon />
                {site.phone}
              </span>
              <Button size="sm" tabIndex={-1}>{header.consultShort}</Button>
              <TelegramCtaButton placement="header" size="sm" iconOnly />
            </div>
          </div>
        </div>

        <nav className={cn("items-center gap-7", desktopCls)} aria-label={header.navAria}>
          {nav.map((item) => {
            const isActive = active === item.href.replace("#", "");
            return (
              <a
                key={item.href}
                href={navHref(item.href, pathname)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "btn-focus whitespace-nowrap rounded text-sm font-medium transition-all duration-300 hover:text-brand hover:[text-shadow:0_0_14px_rgba(246,247,64,0.7)]",
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

        <div className={cn("items-center gap-4", desktopCls)}>
          <CopyContactLink
            value={site.phone}
            type="phone"
            href={site.phoneHref}
            onClick={() => track("header_phone_click", { source: "header_phone" })}
            className={PHONE_CLS}
          >
            <PhoneIcon />
            {site.phone}
          </CopyContactLink>
          <Button size="sm" onClick={handleConsult}>
            {header.consultShort}
          </Button>
          <TelegramCtaButton placement="header" size="sm" iconOnly />
        </div>

        <button
          type="button"
          className={cn("btn-focus rounded-lg p-2 text-white", burgerCls)}
          aria-label={open ? header.menuClose : header.menuOpen}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div
        aria-hidden={!open}
        className={cn(
          "site-menu grid overflow-hidden border-t bg-bg/95 backdrop-blur-md transition-all duration-300 ease-in-out",
          compact === null ? "md:hidden" : compact ? "" : "hidden",
          open
            ? "grid-rows-[1fr] border-bg-line opacity-100"
            : "grid-rows-[0fr] border-transparent opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <nav className="container-x flex flex-col gap-1 py-4" aria-label={header.mobileNavAria}>
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
              {header.consultCta}
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
