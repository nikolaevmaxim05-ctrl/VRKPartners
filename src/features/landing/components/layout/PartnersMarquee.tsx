"use client";

import Image from "next/image";
import { track } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";
import type { Partner } from "@core/domain/content/site-messages";

/**
 * Бесконечный слайдер логотипов партнёров (messages.hero.partners — редактируется из админки).
 * Логотипы кликабельны и ведут на сайты компаний (новая вкладка); без href — просто картинка.
 * Лента дублируется дважды и сдвигается на -50% — бесшовный цикл. Дубль помечен data-clone и
 * aria-hidden: скринридеры не слышат логотипы дважды, а в режиме lite (globals.css, html.lite) дубль
 * скрыт, анимации нет — статичный ряд с горизонтальной прокруткой пальцем, без маски краёв.
 */
export function PartnersMarquee({ partners, className }: { partners: Partner[]; className?: string }) {
  const loop = [...partners, ...partners];
  const tile =
    "btn-focus flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-3 shadow-card ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-0.5 hover:ring-brand/50 sm:h-20 sm:w-48";

  return (
    <div
      className={cn(
        "partners-marquee relative w-full min-w-0 max-w-full overflow-hidden",
        // Плавное затухание логотипов до прозрачного на краях (маска), а не тёмная
        // накладка — чтобы не было «обрезанного чёрного» на анимированном фоне.
        "[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%_-_2.5rem),transparent)]",
        "[-webkit-mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%_-_2.5rem),transparent)]",
        className
      )}
    >
      <ul className="partners-track flex w-max items-center gap-4">
        {loop.map((p, i) => {
          const clone = i >= partners.length;
          const img = (
            <Image src={p.logo} alt={p.name} width={180} height={72} className="h-full w-auto object-contain" />
          );
          return (
            <li key={i} className="shrink-0" data-clone={clone ? "1" : undefined} aria-hidden={clone || undefined}>
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
