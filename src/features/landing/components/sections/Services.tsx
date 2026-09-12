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

function ServiceCard({ s, i }: { s: ServiceItem; i: number }) {
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
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-bg-line bg-bg-card transition-colors",
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
              наведення: прихований absolute-шар ширший за картку розсував сторінку (скан переповнення). */}
          {preview && (
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 z-50 max-w-[92vw] -translate-y-1/2 animate-in fade-in zoom-in-95 duration-300",
              previewPos,
              s.previewWide ? "w-[40rem]" : "w-[22rem]"
            )}
          >
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-xl border border-bg-line bg-white shadow-2xl ring-1 ring-black/40",
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
  const [showAll, setShowAll] = React.useState(false);
  // Після завершення анімації розгортання знімаємо overflow-hidden,
  // щоб збільшене превью карток не обрізалося контейнером.
  const [expanded, setExpanded] = React.useState(false);

  const previewItems = items.slice(0, SERVICES_PREVIEW);
  const extraItems = items.slice(SERVICES_PREVIEW);
  const hiddenCount = extraItems.length;

  const renderCard = (s: ServiceItem, i: number) => (
    <ServiceCard key={i} s={s} i={i} />
  );

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

        {/* Перші 3 — завжди видимі */}
        <div data-items={previewItems.length} className="reveal-stagger mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {previewItems.map(renderCard)}
        </div>

        {/* Решта — плавно розгортаються / згортаються */}
        <div
          onTransitionEnd={() => {
            if (showAll) setExpanded(true);
          }}
          className={cn(
            "grid transition-all duration-500 ease-in-out",
            showAll ? "mt-5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
          )}
        >
          <div className={cn(showAll && expanded ? "overflow-visible" : "overflow-hidden")}>
            <div data-items={extraItems.length} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {extraItems.map(renderCard)}
            </div>
          </div>
        </div>

        {hiddenCount > 0 && (
          <div className="mt-8 flex justify-center">
            {showAll ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setExpanded(false);
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
