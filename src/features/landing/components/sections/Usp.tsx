"use client";

import * as React from "react";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { cn } from "@/shared/lib/utils";
import { ContentIcon } from "@/features/landing/components/layout/ContentIcon";
import { DEFAULT_USP_ICON_ORDER } from "@/shared/lib/audit-icons";
import { hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";
import {
  USP_ACTIVE_SCALE,
  USP_DIMMED_BLUR_PX,
  USP_DIMMED_OPACITY,
  USP_MOBILE_MAX_WIDTH,
  cardState,
  pickActive,
} from "@core/domain/layout/usp-focus";

// Значения эффекта из ядра — в CSS-переменные контейнера; правила — globals.css (.usp-card[data-state]).
const EFFECT_VARS = {
  "--usp-scale": String(USP_ACTIVE_SCALE),
  "--usp-blur": `${USP_DIMMED_BLUR_PX}px`,
  "--usp-dim": String(USP_DIMMED_OPACITY),
} as React.CSSProperties;

export function Usp({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { usp: uspRaw } = useSiteMessages();
  // Пустой пункт (без заголовка) не выводится; ключи React — по индексу (тексты повторяются).
  const usp = { ...uspRaw, items: uspRaw.items.filter((it) => hasText(it.title)) };
  const cardsRef = React.useRef<Array<HTMLDivElement | null>>([]);
  // Активная карточка на мобильном — та, что ближе всего к центру экрана во время скролла (с гистерезисом,
  // правила — core/domain/layout/usp-focus). На десктопе подсветка управляется :hover, так что active = -1.
  const [active, setActive] = React.useState(-1);
  const activeRef = React.useRef(-1);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${USP_MOBILE_MAX_WIDTH}px)`);
    let raf = 0;

    const apply = (next: number) => {
      if (next === activeRef.current) return;
      activeRef.current = next;
      setActive(next);
    };

    const update = () => {
      raf = 0;
      if (!mq.matches) {
        apply(-1);
        return;
      }
      const vh = window.innerHeight;
      const center = vh / 2;
      const distances = cardsRef.current.map((el) => {
        if (!el) return Infinity;
        const r = el.getBoundingClientRect();
        return Math.abs(r.top + r.height / 2 - center);
      });
      apply(pickActive(distances, activeRef.current, vh));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mq.addEventListener?.("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq.removeEventListener?.("change", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [usp.items.length]);

  return (
    <section id="usp" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          {hasText(usp.eyebrow) && (
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              {usp.eyebrow}
            </p>
          )}
          <Title data-fit className="h2 mt-3">{nbHyphen(usp.title)}</Title>
          {hasText(usp.text) && (
            <p className="mt-4 text-lg text-white/60">{usp.text}</p>
          )}
        </div>

        <div
          data-items={usp.items.length}
          style={EFFECT_VARS}
          className="reveal-stagger mt-10 flex flex-wrap justify-center gap-4"
        >
          {usp.items.map((it, i) => {
            const activeNow = i === active;
            return (
              <div
                key={i}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className="group relative w-full sm:w-[calc(50%_-_0.5rem)] lg:w-[calc(33.333%_-_0.667rem)]"
              >
                {/* мягкое свечение ПОЗАДИ карточки — плавно через opacity */}
                <div
                  aria-hidden="true"
                  className={cn(
                    "fx-glow pointer-events-none absolute -inset-1 rounded-[1.4rem] bg-white/20 opacity-0 blur-2xl transition-opacity duration-500 ease-out group-hover:opacity-100",
                    activeNow && "opacity-100"
                  )}
                />

                {/* Эффект на мобильном (масштаб активной, размытие остальных) — на <article>, не на обёртке:
                    обёртка уже несёт transform/transition появления (.reveal-stagger > *). */}
                <article
                  data-state={cardState(i, active, usp.items.length)}
                  className="usp-card relative overflow-hidden rounded-2xl border border-bg-line bg-bg-card p-6 transition-transform duration-500 ease-out group-hover:-translate-y-1"
                >
                  <div className="relative">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 ring-1 ring-brand/30">
                      <ContentIcon icon={it.icon} index={i} order={DEFAULT_USP_ICON_ORDER} className="h-5 w-5 text-brand" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold leading-snug text-white">
                      {it.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">
                      {it.text}
                    </p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
