"use client";

import Image from "next/image";
import { track } from "@/shared/lib/analytics";
import { partners } from "@/shared/config/site";
import { cn } from "@/shared/lib/utils";

/**
 * Безкінечний слайдер логотипів партнерів.
 * Логотипи клікабельні й ведуть на сайти компаній (нова вкладка).
 * Стрічка дублюється двічі та зсувається на -50% — безшовний цикл.
 */
export function PartnersMarquee({ className }: { className?: string }) {
  const loop = [...partners, ...partners];

  return (
    <div
      className={cn(
        "partners-marquee relative w-full min-w-0 max-w-full overflow-hidden",
        // Плавне згасання логотипів до прозорого на краях (маска), а не темна
        // накладка — щоб не було «обрізаного чорного» на анімованому фоні.
        "[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%_-_2.5rem),transparent)]",
        "[-webkit-mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%_-_2.5rem),transparent)]",
        className
      )}
    >
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
