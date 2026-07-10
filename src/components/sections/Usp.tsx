"use client";

import { useContent } from "@/components/ContentProvider";

export function Usp() {
  const { usp } = useContent();

  return (
    <section id="usp" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          {usp.eyebrow && (
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              {usp.eyebrow}
            </p>
          )}
          <h2 className="h2 mt-3">{usp.title}</h2>
          {usp.text && (
            <p className="mt-4 text-lg text-white/60">{usp.text}</p>
          )}
        </div>

        <div className="reveal-stagger mt-10 flex flex-wrap justify-center gap-4">
          {usp.items.map((it, i) => (
            <div
              key={i}
              className="group relative w-full sm:w-[calc(50%_-_0.5rem)] lg:w-[calc(33.333%_-_0.667rem)]"
            >
              {/* м'яке свічення ПОЗАДУ картки — з'являється плавно через opacity */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-[1.4rem] bg-brand/20 opacity-0 blur-2xl transition-opacity duration-500 ease-out group-hover:opacity-100"
              />

              <article className="relative overflow-hidden rounded-2xl border border-bg-line bg-bg-card p-6 transition-transform duration-500 ease-out group-hover:-translate-y-1">
                {/* великий напівпрозорий номер для дизайнерського акценту */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1 -top-5 select-none text-7xl font-black text-white/5 transition-colors duration-500 ease-out group-hover:text-brand/10"
                >
                  {i + 1}
                </span>

                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink ring-4 ring-brand/15">
                    {i + 1}
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
          ))}
        </div>
      </div>
    </section>
  );
}
