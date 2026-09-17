"use client";

import { useSiteMessages } from "@/features/landing/lib/messages";
import { hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";

// Блок «Що ви отримуєте?» (2026-09-17, варіант D «типографічний маркер» за вибором власника, без
// закреслення): кожен пункт — велика жовта фраза (що отримуєте) і сіра друга частина з підписом
// «замість» (замість чого); зліва — великий номер-«привид». Анімація (уточнення власника
// 2026-09-17): частини пункту виїжджають ЗЛІВА по мірі прокрутки — скраб по позиції, сходинками
// номер → жовта → сіра (правило — core/domain/layout/slide-in, DOM — features/landing/lib/slide-in,
// вмикає SlideIn у layout сайту за атрибутами data-slide-in / data-slide-part). Заголовок секції —
// звичайний .reveal. Без JS і в режимі «менше руху» усе на місці. Секція має overflow-x: clip (не
// hidden — не створює скрол-контейнер, якір scroll-margin працює): зсув ліворуч не дає
// горизонтального скролу. Тексти — messages/uk.json (benefits.*), редагуються з адмінки; порожній
// пункт не виводиться.
export function Benefits({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { benefits } = useSiteMessages();
  const items = benefits.items.filter((it) => hasText(it.title));
  if (items.length === 0) return null;

  return (
    <section id="benefits" className="section overflow-x-clip">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          <Title data-fit className="h2">{nbHyphen(benefits.title)}</Title>
        </div>

        <ol data-items={items.length} className="mt-8 list-none p-0 sm:mt-10">
          {items.map((it, i) => (
            <li
              key={i}
              data-slide-in
              className="relative border-t border-bg-line py-8 first:border-t-0 first:pt-4 sm:py-10 lg:py-11 lg:pl-24"
            >
              {/* Номер — декоративний, поза деревом доступності (порядок дає <ol>). На мобільному —
                  справа і помітніший (зауваження власника: зліва під текстом його не видно), на
                  десктопі — зліва в полі відступу. Частина 0 виїзду. */}
              <span
                aria-hidden="true"
                data-slide-part="0"
                className="pointer-events-none absolute right-0 top-5 select-none text-[4.5rem] font-extrabold leading-none tracking-tighter text-brand/20 tabular-nums sm:top-6 lg:left-0 lg:right-auto lg:top-8 lg:text-[5.5rem] lg:text-brand/10"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p
                data-slide-part="1"
                className="relative m-0 text-[1.75rem] font-extrabold leading-[1.12] tracking-tight text-brand [text-wrap:balance] sm:text-4xl lg:max-w-4xl lg:text-[2.75rem]"
              >
                {it.title}
              </p>
              {hasText(it.text) && (
                <p
                  data-slide-part="2"
                  className="relative mt-3.5 max-w-3xl text-base font-medium leading-relaxed text-white/40 sm:text-lg lg:mt-4 lg:text-xl"
                >
                  {hasText(benefits.instead) && (
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand/60">
                      {benefits.instead}
                    </span>
                  )}
                  {it.text}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
