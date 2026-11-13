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
// Время, которое курсор должен задержаться на карточке, прежде чем появится увеличенное превью.
const PREVIEW_HOVER_DELAY_MS = 500;
// Большое hover-превью — только там, где есть настоящее наведение и сетка (≥ sm). На таче тап вызывает
// mouseenter, а в карусели (overflow-x: auto) absolute-превью обрезалось бы или расширяло трек.
const PREVIEW_MEDIA = "(hover: hover) and (min-width: 640px)";
// Брейкпоинт «мобильная карусель» (< sm): совпадает с переходом сетки на 2 колонки.
const TRACK_MEDIA = "(max-width: 639.98px)";

/** Прокрутка, при которой карточка стоит по центру трека (ограничена диапазоном прокрутки). */
function centerOffset(track: HTMLElement, card: HTMLElement): number {
  const target = card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
  return Math.max(0, Math.min(target, track.scrollWidth - track.clientWidth));
}

// Клоны-буферы карусели (< sm): K последних карточек перед первой и K первых после последней, чтобы соседи
// были видны с обеих сторон и цикл не имел «упора». После остановки на клоне трек телепортируется на
// соответствующую реальную карточку (features: см. useEffect в Services).
const LOOP_CLONES = 2;
/** Пауза после последнего scroll, когда нет события scrollend (iOS Safari), мс. */
const SCROLL_SETTLE_MS = 120;

function ServiceCard({
  s,
  i,
  collapsed,
  zoomLabel,
  clone = false,
  side,
}: {
  s: ServiceItem;
  i: number;
  collapsed: boolean;
  zoomLabel: string;
  /** Клон-буфер карусели: вне дерева доступности и табуляции, без reveal-анимации; лайтбокс работает. */
  clone?: boolean;
  /** Клон слева (order: -1 — в DOM после реальных карточек, визуально перед ними) или справа. */
  side?: "left" | "right";
}) {
  // Показом большого превью управляем состоянием: включаем через таймер, выключаем сразу.
  const [preview, setPreview] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Лайтбокс (шаг 3b): только там, где нет hover-превью (тач / < sm). Определяем после монтирования —
  // SSR рендерит миниатюру как div, на тач-устройствах она становится кнопкой (без расхождений гидрации).
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
  // Миниатюры, которые показываем полностью (вписываем), а не обрезаем
  const containKeys = new Set(["demandgen", "maps", "app", "search", "display", "remarketing", "shopping", "youtube"]);
  const contain = containKeys.has(s.key);
  const previewSrc = s.mockupFull ?? s.mockup;
  // Колонка на десктопе (3 в ряд) — чтобы превью крайних карточек не вылезало за экран
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
      data-slide={i}
      data-clone={clone ? side : undefined}
      aria-hidden={clone ? "true" : undefined}
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-bg-line bg-bg-card transition-colors",
        // Клон слева: в DOM — после всех, визуально — перед первой (order), чтобы nth-child задержки
        // появления реальных карточек не сдвигались.
        clone && side === "left" && "order-first",
        // < sm: слайд карусели — 82 % ширины экрана, ПО ЦЕНТРУ (snap-center), соседи симметрично
        // «выглядывают» с обеих сторон (замечание владельца: карточка стояла слева, а не по центру).
        "max-sm:w-[82vw] max-sm:shrink-0 max-sm:snap-center",
        // ≥ sm: свёрнутые карточки (после первых трёх) скрыты; при разворачивании — короткое появление.
        collapsed ? "sm:hidden" : i >= SERVICES_PREVIEW && "sm:animate-in sm:fade-in sm:slide-in-from-top-2 sm:duration-500",
        preview && "z-30 border-brand/40"
      )}
    >
      {s.mockup ? (
        <>
          {/* Миниатюра. На таче (без hover-превью) — кнопка: тап открывает лайтбокс с большим
              скриншотом; на десктопе с hover — обычный блок (клик ничего не открывает). */}
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
                // Клон: вне табуляции (aria-hidden на карточке), но тап открывает тот же лайтбокс.
                tabIndex={clone ? -1 : undefined}
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
          {/* Большое читаемое превью — появляется после задержки наведения. Рендерится ТОЛЬКО во время
              наведения: скрытый absolute-слой шире карточки раздвигал страницу (скан переполнения).
              Позиция (translate) и анимация появления (animate-in — кейфрейм enter пишет transform) — на РАЗНЫХ
              элементах: на одном кейфрейм перебивал -translate-x/y-1/2, и превью «приезжало» сбоку. */}
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
  // Пустая карточка (без названия) не выводится.
  const items = services.items.filter((s) => hasText(s.name));
  // ≥ sm: первые 3 карточки + «Показати більше»; < sm: все карточки в одном горизонтальном треке
  // (шаг 3 мобильных анимаций — горизонтальная карусель возвращена решением владельца 2026-09-14) —
  // showAll там не используется, кнопки нет в DOM.
  const [showAll, setShowAll] = React.useState(false);
  const hiddenCount = Math.max(0, items.length - SERVICES_PREVIEW);

  // Карусель (< sm), цикличная (решение владельца 2026-09-15): клоны-буферы по краям (loop = true после
  // гидрации, только при TRACK_MEDIA; SSR и десктоп — без клонов), активная точка — слайд, центр которого
  // ближе всего к центру трека, индекс по модулю N; после остановки прокрутки на клоне (scrollend или
  // пауза SCROLL_SETTLE_MS) — мгновенный телепорт на соответствующую реальную карточку (одинаковая ширина
  // слайдов и gap → кадр не меняется). В scroll: passive → rAF → арифметика + setState только при изменении.
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [loop, setLoop] = React.useState(false);
  const n = items.length;
  const k = n > LOOP_CLONES ? LOOP_CLONES : 0;

  // Включать ли цикл: по брейкпоинту, после монтирования (до первого кадра — useLayoutEffect).
  React.useLayoutEffect(() => {
    const mq = window.matchMedia(TRACK_MEDIA);
    const sync = () => setLoop(mq.matches && k > 0);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [k]);

  // Старт: когда клоны смонтированы — мгновенно встать на первую РЕАЛЬНУЮ карточку (до paint, без скачка).
  React.useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!loop) {
      track.scrollTo({ left: 0, behavior: "auto" });
      return;
    }
    const first = track.querySelector<HTMLElement>('[data-service-card]:not([data-clone])');
    if (first) track.scrollTo({ left: centerOffset(track, first), behavior: "auto" });
  }, [loop]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const mq = window.matchMedia(TRACK_MEDIA);
    let raf = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let teleporting = false;

    /** Ближайший к центру трека слайд (реальный или клон). */
    const nearest = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      track.querySelectorAll<HTMLElement>("[data-service-card]").forEach((el) => {
        const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      });
      return best as HTMLElement | null;
    };

    const update = () => {
      raf = 0;
      if (!mq.matches) return;
      const el = nearest();
      if (!el) return;
      const idx = Number(el.dataset.slide) || 0; // у клона data-slide = индекс реальной карточки
      setActiveSlide((a) => (a === idx ? a : idx));
    };

    // Телепорт с клона на реальную карточку той же услуги (тот же кадр).
    const settle = () => {
      settleTimer = null;
      if (!mq.matches || teleporting) return;
      const el = nearest();
      if (!el || !el.dataset.clone) return;
      const real = track.querySelector<HTMLElement>(`[data-service-card][data-slide="${el.dataset.slide}"]:not([data-clone])`);
      if (!real) return;
      const delta = real.offsetLeft - el.offsetLeft;
      teleporting = true;
      track.scrollTo({ left: track.scrollLeft + delta, behavior: "auto" });
      requestAnimationFrame(() => {
        teleporting = false;
      });
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
      if (!("onscrollend" in window)) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, SCROLL_SETTLE_MS);
      }
    };
    const onScrollEnd = () => settle();

    update();
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("resize", onScroll);
    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [n, loop]);

  /** Прокрутка к слайду idx — к ближайшему экземпляру (реальному или клону): с последней на первую — один шаг. */
  const scrollToSlide = (idx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const candidates = Array.from(track.querySelectorAll<HTMLElement>(`[data-service-card][data-slide="${idx}"]`));
    if (candidates.length === 0) return;
    const current = track.scrollLeft;
    let best = candidates[0];
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(centerOffset(track, c) - current);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: centerOffset(track, best), behavior: reduced ? "auto" : "smooth" });
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

        {/* Один список карточек. < sm: горизонтальный трек со snap на всю ширину экрана (вынос на
            боковые отступы .container-x; внутренние отступы по 9vw — чтобы первая/последняя карточка стояли
            по центру, как и остальные), скроллбар скрыт;
            трек сам обрезает содержимое — страница не получает горизонтального скролла; края растворяются
            горизонтальной маской (.services-track, как лента партнёров). ≥ sm: сетка 2/3 колонки,
            карточки после первых трёх скрыты до «Показати більше». */}
        {/* Обёртка несёт focus-ring трека (.services-wrap: маска обрезает box-shadow самого трека, поэтому
            кольцо — здесь). Маска краёв постоянная с обеих сторон (цикл — «краёв» нет). */}
        <div className="services-wrap relative mt-12 rounded-2xl max-sm:-mx-5">
          <div
            ref={trackRef}
            role="region"
            aria-roledescription="carousel"
            aria-label={services.title}
            tabIndex={0}
            data-items={items.length}
            data-loop={loop ? "1" : undefined}
            className={cn(
              "reveal-stagger gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-3",
              // pb-5 — запас под translateY(20px) появления детей (.reveal-stagger > *), чтобы трек их не обрезал.
              "max-sm:flex max-sm:gap-4 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-[9vw] max-sm:pb-5",
              "max-sm:snap-x max-sm:snap-mandatory max-sm:overscroll-x-contain",
              "services-track no-scrollbar outline-none"
            )}
          >
            {items.map((s, i) => (
              <ServiceCard key={i} s={s} i={i} collapsed={i >= SERVICES_PREVIEW && !showAll} zoomLabel={services.zoomLabel} />
            ))}
            {/* Клоны-буферы (только loop): K первых — после последней; K последних — в DOM тоже после, но
                визуально перед первой (order-first), чтобы nth-child задержки появления реальных не сдвигались. */}
            {loop &&
              items.slice(0, k).map((s, i) => (
                <ServiceCard key={`clone-r-${i}`} s={s} i={i} collapsed={false} zoomLabel={services.zoomLabel} clone side="right" />
              ))}
            {loop &&
              items.slice(n - k).map((s, j) => (
                <ServiceCard key={`clone-l-${j}`} s={s} i={n - k + j} collapsed={false} zoomLabel={services.zoomLabel} clone side="left" />
              ))}
          </div>
        </div>

        {/* Точки карусели (< sm): по одной на карточку, активная — ближайшая к левому краю. Декоративные
            (aria-hidden, не в табе): трек прокручивается свайпом и клавиатурой. */}
        {items.length > 1 && (
          <div aria-hidden="true" data-carousel-dots className="mt-1 flex justify-center gap-2 sm:hidden">
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
