"use client";

import * as React from "react";
import Image from "next/image";
import {
  Search,
  ShoppingBag,
  Sparkles,
  Youtube,
  TrendingUp,
  RefreshCw,
  LayoutGrid,
  Smartphone,
  MapPin,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { hasText } from "@core/domain/content/messages";
import type { ServiceItem } from "@core/domain/content/site-messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";
import { track } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";

const icons: Record<string, LucideIcon> = {
  search: Search,
  shopping: ShoppingBag,
  pmax: Sparkles,
  youtube: Youtube,
  demandgen: TrendingUp,
  remarketing: RefreshCw,
  display: LayoutGrid,
  app: Smartphone,
  maps: MapPin,
};

const SERVICES_PREVIEW = 3;
// Час, який курсор має затриматись на картці, перш ніж зʼявиться збільшене превью.
const PREVIEW_HOVER_DELAY_MS = 500;
// Велике hover-превью — лише там, де є справжнє наведення і сітка (≥ sm). На тачі тап викликає
// mouseenter, а в каруселі (overflow-x: auto) absolute-превью обрізалося б або розширювало трек.
const PREVIEW_MEDIA = "(hover: hover) and (min-width: 640px)";
// Брейкпоінт «мобільна карусель» (< sm): збігається з переходом сітки на 2 колонки.
const CAROUSEL_MEDIA = "(max-width: 639.98px)";

/** Початок слайда в треку = внутрішній відступ треку (= scroll-padding): картка стає врівень із заголовком. */
function slideStart(track: HTMLElement): number {
  return parseFloat(getComputedStyle(track).paddingLeft) || 0;
}

function ServiceCard({ s, i, collapsed }: { s: ServiceItem; i: number; collapsed: boolean }) {
  // Показ великого превью керуємо станом: вмикаємо через таймер, вимикаємо одразу.
  const [preview, setPreview] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const handleEnter = () => {
    clearTimer();
    if (!window.matchMedia(PREVIEW_MEDIA).matches) return;
    timerRef.current = setTimeout(() => setPreview(true), PREVIEW_HOVER_DELAY_MS);
  };
  const handleLeave = () => {
    clearTimer();
    setPreview(false);
  };
  React.useEffect(() => clearTimer, []);

  const Icon = icons[s.key] ?? Sparkles;
  // Мініатюри, які показуємо повністю (вписуємо), а не обрізаємо
  const containKeys = new Set(["demandgen", "maps", "app", "search", "display", "remarketing", "shopping", "youtube"]);
  const contain = containKeys.has(s.key);
  const previewSrc = s.mockupFull ?? s.mockup;
  // Колонка на десктопі (3 в ряд) — щоб превью крайніх карток не вилазило за екран
  const col = i % 3;
  const previewPos =
    col === 0
      ? "left-0"
      : col === 2
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <article
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      data-service-card
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-bg-line bg-bg-card transition-colors",
        // < sm: слайд каруселі — 84 % ширини треку (край наступної картки «визирає»), snap по лівому краю.
        "max-sm:w-[84%] max-sm:shrink-0 max-sm:snap-start",
        // ≥ sm: згорнуті картки (після перших трьох) приховані; при розгортанні — коротка поява.
        collapsed ? "sm:hidden" : i >= SERVICES_PREVIEW && "sm:animate-in sm:fade-in sm:slide-in-from-top-2 sm:duration-500",
        preview && "z-30 border-brand/40"
      )}
    >
      {s.mockup ? (
        <>
          <div className="relative h-40 w-full overflow-hidden rounded-t-2xl border-b border-bg-line bg-white/95">
            <Image
              src={s.mockup}
              alt={s.mockupAlt ?? s.name}
              fill
              sizes="(max-width: 768px) 100vw, 380px"
              className={cn(
                "transition-transform duration-500",
                preview && "scale-[1.03]",
                contain ? "object-contain p-2" : "object-cover object-top"
              )}
            />
          </div>
          {/* Велике читабельне превью — зʼявляється після затримки наведення. Рендериться ЛИШЕ під час
              наведення: прихований absolute-шар ширший за картку розсував сторінку (скан переповнення).
              Позиція (translate) і анімація появи (animate-in — кейфрейм enter пише transform) — на РІЗНИХ
              елементах: на одному кейфрейм перебивав -translate-x/y-1/2, і превью «приїжджало» збоку. */}
          {preview && (
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 z-50 max-w-[92vw] -translate-y-1/2",
              previewPos,
              s.previewWide ? "w-[40rem]" : "w-[22rem]"
            )}
          >
            <div
              className={cn(
                "relative w-full origin-center overflow-hidden rounded-xl border border-bg-line bg-white shadow-2xl ring-1 ring-black/40 animate-in fade-in zoom-in-95 duration-300",
                s.previewWide ? "h-[22rem]" : "h-[32rem]"
              )}
            >
              <Image
                src={previewSrc as string}
                alt={s.name}
                fill
                sizes={s.previewWide ? "672px" : "352px"}
                className="object-contain p-3"
              />
            </div>
          </div>
          )}
        </>
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-t-2xl border-b border-bg-line bg-bg-soft">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/30">
            <Icon className="h-8 w-8 text-brand" />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand" />
          <h3 className="text-base font-semibold text-white">{s.name}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{s.desc}</p>
      </div>
    </article>
  );
}

export function Services({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { openLead } = useLeadModal();
  const { services } = useSiteMessages();
  // Порожня картка (без назви) не виводиться.
  const items = services.items.filter((s) => hasText(s.name));
  // ≥ sm: перші 3 картки + «Показати більше»; < sm: усі картки в одному горизонтальному треку
  // (крок 3 мобільних анімацій) — showAll там не використовується, кнопки немає в DOM.
  const [showAll, setShowAll] = React.useState(false);
  const hiddenCount = Math.max(0, items.length - SERVICES_PREVIEW);

  // Карусель (< sm): активна точка — картка, найближча до лівого краю треку (scroll → rAF).
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = React.useState(0);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const mq = window.matchMedia(CAROUSEL_MEDIA);
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!mq.matches) return;
      const left = track.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      track.querySelectorAll<HTMLElement>("[data-service-card]").forEach((el, idx) => {
        const dist = Math.abs(el.offsetLeft - slideStart(track) - left);
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
      setActiveSlide((a) => (a === best ? a : best));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length]);

  const scrollToSlide = (idx: number) => {
    const track = trackRef.current;
    const card = track?.querySelectorAll<HTMLElement>("[data-service-card]")[idx];
    if (!track || !card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: card.offsetLeft - slideStart(track), behavior: reduced ? "auto" : "smooth" });
  };

  const handleCta = () => {
    track("services_cta_click", { source: "services" });
    openLead({
      title: services.popup.title || services.cta,
      description: services.popup.note || services.text,
      source: "services",
      submitLabel: services.submitLabel,
    });
  };

  return (
    <section id="services" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          <Title data-fit className="h2">{nbHyphen(services.title)}</Title>
          {hasText(services.text) && <p className="mt-4 text-lg text-white/60">{services.text}</p>}
        </div>

        {/* Один список карток. < sm: горизонтальний трек зі snap на всю ширину екрана (винос на
            бокові відступи .container-x, scroll-padding = ті самі відступи), скролбар прихований;
            трек сам обрізає вміст, тож сторінка не отримує горизонтального скролу.
            ≥ sm: сітка 2/3 колонки, картки після перших трьох приховані до «Показати більше». */}
        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label={services.title}
          tabIndex={0}
          data-items={items.length}
          className={cn(
            "reveal-stagger relative mt-12 gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-3",
            // pb-5 — запас під translateY(20px) появи дітей (.reveal-stagger > *), щоб трек їх не обрізав.
            "max-sm:-mx-5 max-sm:flex max-sm:gap-4 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-5 max-sm:pb-5 max-sm:scroll-px-5",
            "max-sm:snap-x max-sm:snap-mandatory max-sm:overscroll-x-contain no-scrollbar btn-focus rounded-2xl"
          )}
        >
          {items.map((s, i) => (
            <ServiceCard key={i} s={s} i={i} collapsed={i >= SERVICES_PREVIEW && !showAll} />
          ))}
        </div>

        {/* Точки каруселі (< sm): по одній на картку, активна — найближча до лівого краю. Декоративні
            (aria-hidden, не в табі): трек прокручується свайпом і клавіатурою. */}
        {items.length > 1 && (
          <div aria-hidden="true" className="mt-1 flex justify-center gap-2 sm:hidden">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => scrollToSlide(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === activeSlide ? "w-5 bg-brand" : "w-2 bg-white/25"
                )}
              />
            ))}
          </div>
        )}

        {hiddenCount > 0 && (
          <div className="mt-8 hidden justify-center sm:flex">
            {showAll ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAll(false);
                  document
                    .getElementById("services")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {services.showLess}
                <ChevronUp className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShowAll(true)}>
                {services.showMore}
                <span className="text-white/50">(+{hiddenCount})</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          {hasText(services.cta) && (
            <Button size="lg" onClick={handleCta}>
              {services.cta}
            </Button>
          )}
          <TelegramCtaButton placement="services" size="lg" />
        </div>
      </div>
    </section>
  );
}
