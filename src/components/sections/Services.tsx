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
import { Button } from "@/components/ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { services } from "@/config/site";
import { cn } from "@/lib/utils";

type ServiceItem = (typeof services.items)[number];

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

export function Services() {
  const { openLead } = useLeadModal();
  const [showAll, setShowAll] = React.useState(false);

  const previewItems = services.items.slice(0, SERVICES_PREVIEW);
  const extraItems = services.items.slice(SERVICES_PREVIEW);
  const hiddenCount = extraItems.length;

  const renderCard = (s: ServiceItem) => {
    const Icon = icons[s.key] ?? Sparkles;
    // Ці формати показуємо повністю (вписуємо), а не обрізаємо
    const containKeys = new Set(["demandgen", "maps", "app", "search"]);
    const contain = containKeys.has(s.key);
    return (
      <article
        key={s.key}
        className="group flex flex-col overflow-hidden rounded-2xl border border-bg-line bg-bg-card transition-colors hover:border-brand/40"
      >
        {s.mockup ? (
          <div className="relative h-40 w-full overflow-hidden border-b border-bg-line bg-white/95">
            <Image
              src={s.mockup}
              alt={s.mockupAlt ?? s.name}
              fill
              sizes="(max-width: 768px) 100vw, 380px"
              className={cn(
                "transition-transform duration-500 group-hover:scale-[1.03]",
                contain ? "object-contain p-2" : "object-cover object-top"
              )}
            />
          </div>
        ) : (
          <div className="flex h-40 w-full items-center justify-center border-b border-bg-line bg-bg-soft">
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
  };

  const handleCta = () => {
    track(analyticsEvents.ctaClick, { source: "services" });
    openLead({
      title: services.popup.title,
      description: services.popup.note,
      source: "services",
      submitLabel: "Отримати консультацію",
    });
  };

  return (
    <section id="services" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          <span className="eyebrow">{services.eyebrow}</span>
          <h2 className="h2 mt-4">{services.title}</h2>
          <p className="mt-4 text-lg text-white/60">{services.text}</p>
        </div>

        {/* Перші 3 — завжди видимі */}
        <div className="reveal-stagger mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {previewItems.map(renderCard)}
        </div>

        {/* Решта — плавно розгортаються / згортаються */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-in-out",
            showAll ? "mt-5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                  setShowAll(false);
                  document
                    .getElementById("services")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Згорнути
                <ChevronUp className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShowAll(true)}>
                Показати більше
                <span className="text-white/50">(+{hiddenCount})</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <div className="mt-10 flex justify-center">
          <Button size="lg" onClick={handleCta}>
            {services.cta}
          </Button>
        </div>
      </div>
    </section>
  );
}
