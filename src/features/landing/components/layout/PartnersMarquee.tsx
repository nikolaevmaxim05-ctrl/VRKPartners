"use client";

import Image from "next/image";
import { track } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";
import type { Partner } from "@core/domain/content/site-messages";

/**
 * Безкінечний слайдер логотипів партнерів (messages.hero.partners — редагується з адмінки).
 * Логотипи клікабельні й ведуть на сайти компаній (нова вкладка); без href — просто картинка.
 * Стрічка дублюється двічі та зсувається на -50% — безшовний цикл.
 */
export function PartnersMarquee({ partners, className }: { partners: Partner[]; className?: string }) {
  const loop = [...partners, ...partners];
  const tile =
    "btn-focus flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-3 shadow-card ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-0.5 hover:ring-brand/50 sm:h-20 sm:w-48";

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
        {loop.map((p, i) => {
          const img = (
            <Image src={p.logo} alt={p.name} width={180} height={72} className="h-full w-auto object-contain" />
          );
          return (
            <li key={i} className="shrink-0">
              {p.href ? (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  aria-label={p.name}
                  onClick={() => track("partner_click", { partner: p.name })}
                  className={tile}
                >
                  {img}
                </a>
              ) : (
                <span className={tile}>{img}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
