"use client";

import Image from "next/image";
import { track } from "@/lib/analytics";
import { partners } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Безкінечний слайдер логотипів партнерів.
 * Логотипи клікабельні й ведуть на сайти компаній (нова вкладка).
 * Стрічка дублюється двічі та зсувається на -50% — безшовний цикл.
 */
export function PartnersMarquee({ className }: { className?: string }) {
  const loop = [...partners, ...partners];

  return (
    <div className={cn("partners-marquee relative w-full min-w-0 max-w-full overflow-hidden", className)}>
      {/* розмиті краї */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg to-transparent sm:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg to-transparent sm:w-20" />

      <ul className="partners-track flex w-max items-center gap-4">
        {loop.map((p, i) => (
          <li key={`${p.name}-${i}`} className="shrink-0">
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              aria-label={p.name}
              onClick={() => track("partner_click", { partner: p.name })}
              className="btn-focus flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-3 shadow-card ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-0.5 hover:ring-brand/50 sm:h-20 sm:w-48"
            >
              <Image
                src={p.logo}
                alt={p.name}
                width={180}
                height={72}
                className="h-full w-auto object-contain"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
