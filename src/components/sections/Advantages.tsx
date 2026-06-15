"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usps } from "@/config/site";

/**
 * УТП з кейсів — горизонтальна карусель із перемиканням стрілками по боках.
 * Також працює свайп. Краї плавно затухають, щоб обрізка виглядала акуратно.
 */
export function Advantages() {
  const trackRef = React.useRef<HTMLUListElement>(null);

  const scroll = (dir: "prev" | "next") => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 288);
    el.scrollBy({ left: dir === "next" ? amount : -amount, behavior: "smooth" });
  };

  return (
    <section className="overflow-hidden border-y border-bg-line bg-[#0d0d11] py-12 sm:py-16">
      <div className="container-x">
        <h2 className="reveal max-w-2xl text-2xl font-bold sm:text-3xl">{usps.title}</h2>

        <div className="relative mt-8">
          {/* легке затухання країв */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[#0d0d11] to-transparent sm:w-12" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[#0d0d11] to-transparent sm:w-12" />

          {/* напівпрозорі стрілки поверх карток */}
          <button
            type="button"
            aria-label="Попередні"
            onClick={() => scroll("prev")}
            className="btn-focus absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-bg-card/50 text-white/60 backdrop-blur-sm transition hover:bg-bg-card/90 hover:text-brand active:scale-95 sm:left-2 sm:h-12 sm:w-12"
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            type="button"
            aria-label="Наступні"
            onClick={() => scroll("next")}
            className="btn-focus absolute right-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-bg-card/50 text-white/60 backdrop-blur-sm transition hover:bg-bg-card/90 hover:text-brand active:scale-95 sm:right-2 sm:h-12 sm:w-12"
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* стрічка на всю ширину */}
          <ul
            ref={trackRef}
            className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[calc((100%_-_18rem)_/_2)] pb-2 sm:scroll-pl-16 sm:scroll-pr-16 sm:px-16"
          >
            {usps.items.map((u, i) => (
              <li
                key={`${u.text}-${i}`}
                className="flex w-72 shrink-0 snap-center flex-col justify-between gap-3 rounded-2xl border border-bg-line bg-bg-card p-5 shadow-card sm:w-80 sm:snap-start"
              >
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand ring-1 ring-brand/30">
                  {u.niche}
                </span>
                <p className="text-sm leading-relaxed text-white/80">{u.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
