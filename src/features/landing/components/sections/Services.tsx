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
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { ImageLightbox } from "@/features/landing/components/ui/ImageLightbox";
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
// Брейкпоінт «мобільне вікно прокрутки» (< sm): збігається з переходом сітки на 2 колонки.
const WINDOW_MEDIA = "(max-width: 639.98px)";
// Висота вікна = WINDOW_CARDS карток (одна цілком + верх наступної як підказка) + проміжок.
const WINDOW_CARDS = 1.5;

function ServiceCard({ s, i, collapsed, zoomLabel }: { s: ServiceItem; i: number; collapsed: boolean; zoomLabel: string }) {
  // Показ великого превью керуємо станом: вмикаємо через таймер, вимикаємо одразу.
  const [preview, setPreview] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Лайтбокс (крок 3b): лише там, де немає hover-превью (тач / < sm). Визначаємо після монтування —
  // SSR рендерить мініатюру як div, на тачі вона стає кнопкою (без розбіжностей гідрації).
  const [zoomable, setZoomable] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  const zoomBtnRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    const mq = window.matchMedia(PREVIEW_MEDIA);
    const sync = () => setZoomable(!mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  const closeLightbox = React.useCallback(() => setLightbox(false), []);

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
        // < sm: рядок вертикального вікна прокрутки — не стискається по висоті.
        "max-sm:shrink-0",
        // ≥ sm: згорнуті картки (після перших трьох) приховані; при розгортанні — коротка поява.
        collapsed ? "sm:hidden" : i >= SERVICES_PREVIEW && "sm:animate-in sm:fade-in sm:slide-in-from-top-2 sm:duration-500",
        preview && "z-30 border-brand/40"
      )}
    >
      {s.mockup ? (
        <>
          {/* Мініатюра. На тачі (без hover-превью) — кнопка: тап відкриває лайтбокс із великим
              скріншотом; на десктопі з hover — звичайний блок (клік нічого не відкриває). */}
          {(() => {
            const thumb = (
              <>
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
                {zoomable && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </span>
                )}
              </>
            );
            const cls = "relative block h-40 w-full overflow-hidden rounded-t-2xl border-b border-bg-line bg-white/95";
            return zoomable ? (
              <button
                ref={zoomBtnRef}
                type="button"
                data-zoom-trigger
                aria-label={`${zoomLabel}: ${s.name}`}
                onClick={() => setLightbox(true)}
                className={cn(cls, "btn-focus text-left")}
              >
                {thumb}
              </button>
            ) : (
              <div className={cls}>{thumb}</div>
            );
          })()}
          {zoomable && (
            <ImageLightbox
              open={lightbox}
              onClose={closeLightbox}
              src={previewSrc as string}
              alt={s.name}
              returnFocusTo={zoomBtnRef.current}
            />
          )}
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
  // ≥ sm: перші 3 картки + «Показати більше»; < sm: усі картки у вертикальному вікні з внутрішньою
  // прокруткою (крок 3 мобільних анімацій, уточнення власника) — showAll там не використовується,
  // кнопки немає в DOM.
  const [showAll, setShowAll] = React.useState(false);
  const hiddenCount = Math.max(0, items.length - SERVICES_PREVIEW);

  // Вікно прокрутки (< sm): висота = WINDOW_CARDS × перша картка + проміжок (CSS-змінна, перемір
  // ResizeObserver-ом — не у scroll); індикатори: затухання зверху/знизу (data-at-start/-end на обгортці)
  // і смужка-прогрес справа (бігунок — transform). У scroll: passive → rAF → арифметика + запис стилів.
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const windowRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const win = windowRef.current;
    const thumb = thumbRef.current;
    if (!wrap || !win || !thumb) return;
    const mq = window.matchMedia(WINDOW_MEDIA);
    let raf = 0;

    const update = () => {
      raf = 0;
      if (!mq.matches) return;
      const st = win.scrollTop;
      const sh = win.scrollHeight;
      const ch = win.clientHeight;
      const scrollable = sh - ch > 1;
      wrap.dataset.scrollable = scrollable ? "1" : "0";
      wrap.dataset.atStart = st <= 1 ? "1" : "0";
      wrap.dataset.atEnd = st + ch >= sh - 1 ? "1" : "0";
      if (scrollable) {
        const thumbH = Math.max(16, (ch * ch) / sh);
        const y = (st / (sh - ch)) * (ch - thumbH);
        thumb.style.height = `${thumbH}px`;
        thumb.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    // Висота вікна за першою карткою; поза брейкпоінтом змінну знімаємо (сітка ≥ sm без обмежень).
    const measure = () => {
      if (!mq.matches) {
        win.style.removeProperty("--services-window");
        return;
      }
      const first = win.querySelector<HTMLElement>("[data-service-card]");
      const gap = parseFloat(getComputedStyle(win).rowGap) || 0;
      if (first && first.offsetHeight > 0) {
        win.style.setProperty("--services-window", `${Math.round(WINDOW_CARDS * first.offsetHeight + gap)}px`);
      }
      schedule();
    };

    measure();
    win.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    mq.addEventListener?.("change", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    const first = win.querySelector<HTMLElement>("[data-service-card]");
    if (first) ro?.observe(first);
    ro?.observe(win);
    return () => {
      win.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      mq.removeEventListener?.("change", measure);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length]);

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

        {/* Один список карток. < sm: вертикальне вікно з внутрішньою прокруткою (колонка карток,
            overflow-y: auto, скролбар прихований, chaining дозволений: на краях прокрутка передається
            сторінці), висота — CSS-змінна --services-window (1,5 картки; фолбек без JS), не вище 80svh.
            ≥ sm: сітка 2/3 колонки, картки після перших трьох приховані до «Показати більше». */}
        <div ref={wrapRef} className="group/win relative mt-12" data-at-start="1" data-at-end="0" data-scrollable="0">
          <div
            ref={windowRef}
            role="region"
            aria-label={services.title}
            tabIndex={0}
            data-items={items.length}
            className={cn(
              "reveal-stagger gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-3",
              "max-sm:flex max-sm:flex-col max-sm:gap-4 max-sm:overflow-y-auto max-sm:overscroll-y-auto max-sm:pr-3",
              "max-sm:h-[var(--services-window,min(34rem,75svh))] max-sm:max-h-[80svh]",
              // Вільна прокрутка без snap (рішення власника).
              "no-scrollbar btn-focus rounded-2xl"
            )}
          >
            {items.map((s, i) => (
              <ServiceCard key={i} s={s} i={i} collapsed={i >= SERVICES_PREVIEW && !showAll} zoomLabel={services.zoomLabel} />
            ))}
          </div>

          {/* Індикатори вікна (< sm, декоративні): затухання зверху/знизу зникає на відповідному краю;
              смужка-прогрес справа — бігунок за scrollTop (transform). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-2xl bg-gradient-to-b from-bg to-transparent transition-opacity duration-300 group-data-[at-start=1]/win:opacity-0 sm:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-bg to-transparent transition-opacity duration-300 group-data-[at-end=1]/win:opacity-0 sm:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 right-0 top-1 w-0.5 rounded-full bg-white/10 group-data-[scrollable=0]/win:hidden sm:hidden"
          >
            <div ref={thumbRef} className="w-full rounded-full bg-brand/70 will-change-transform" style={{ height: "25%" }} />
          </div>
        </div>

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
