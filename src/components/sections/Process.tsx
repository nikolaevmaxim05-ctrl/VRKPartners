"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/landing-ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track } from "@/lib/analytics";
import { useContent } from "@/components/ContentProvider";
import { cn } from "@/lib/utils";

// Десктоп: понад стільки кроків — гортаємо сторінками зі стрілками (інакше тісно).
const DESKTOP_PAGINATE_THRESHOLD = 10;
const DESKTOP_PAGE_SIZE = 8;

export function Process() {
  const { openLead } = useLeadModal();
  const { workflow } = useContent();

  const steps = workflow.steps;
  const paginated = steps.length > DESKTOP_PAGINATE_THRESHOLD;
  const pageCount = paginated ? Math.ceil(steps.length / DESKTOP_PAGE_SIZE) : 1;
  const [page, setPage] = React.useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const visibleSteps = paginated
    ? steps.slice(safePage * DESKTOP_PAGE_SIZE, safePage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE)
    : steps;
  const cols = Math.max(visibleSteps.length, 1);

  const handleBonus = () => {
    track("google_bonus_cta_click", { source: "google_bonus" });
    openLead({
      title: workflow.bonus.cta,
      description: workflow.bonus.desc,
      source: "google_bonus",
      submitLabel: workflow.bonus.cta,
    });
  };

  return (
    <section id="process" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          <h2 className="h2">{workflow.title}</h2>
        </div>

        {/* Мобільний: компактний вертикальний таймлайн */}
        <ol className="reveal-stagger relative ml-3 mt-8 space-y-4 border-l-2 border-bg-line lg:hidden">
          {workflow.steps.map((step) => (
            <li key={step.n} className="relative flex min-h-[1.75rem] items-center pl-6">
              <span className="absolute left-0 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-ink ring-4 ring-bg-soft">
                {step.n}
              </span>
              <h3 className="text-sm font-semibold leading-snug text-white">{step.title}</h3>
            </li>
          ))}
        </ol>

        {/* Десктоп: горизонтальний таймлайн; при великій к-сті кроків — гортання стрілками */}
        <div className="mt-14 hidden lg:block">
          <div className="flex items-center gap-4">
            {paginated && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Попередні кроки"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bg-line text-white/70 transition-colors hover:border-brand/50 hover:text-white disabled:opacity-30 disabled:hover:border-bg-line disabled:hover:text-white/70"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <ol
              className="reveal-stagger relative grid flex-1"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {/* лінія від центру першого до центру останнього кроку */}
              <div
                className="absolute top-5 h-0.5 bg-bg-line"
                style={{ left: `${50 / cols}%`, right: `${50 / cols}%` }}
                aria-hidden="true"
              />
              {visibleSteps.map((step) => (
                <li key={step.n} className="relative flex flex-col items-center px-2 text-center">
                  <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink ring-4 ring-bg-soft">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold leading-snug text-white">
                    {step.title}
                  </h3>
                </li>
              ))}
            </ol>

            {paginated && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                aria-label="Наступні кроки"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bg-line text-white/70 transition-colors hover:border-brand/50 hover:text-white disabled:opacity-30 disabled:hover:border-bg-line disabled:hover:text-white/70"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          {paginated && (
            <div className="mt-6 flex justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPage(idx)}
                  aria-label={`Сторінка ${idx + 1}`}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    idx === safePage ? "bg-brand" : "bg-bg-line hover:bg-white/30",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Підблок: бонус від Google */}
        <div className="reveal mt-12 overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <h3 className="text-2xl font-bold text-white">{workflow.bonus.title}</h3>
              <p className="mt-2 max-w-2xl text-sm text-white/65">{workflow.bonus.desc}</p>

              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                {workflow.bonus.terms.map((term) => {
                  const t = term as { label: string; value: string; highlight?: string };
                  const parts = t.highlight ? t.value.split(t.highlight) : [t.value];
                  return (
                    <div key={t.label} className="rounded-xl border border-bg-line bg-bg-soft p-3">
                      <dt className="text-xs uppercase tracking-wide text-white/40">{t.label}</dt>
                      <dd className="mt-1 text-sm font-medium text-white/85">
                        {t.highlight ? (
                          parts.map((part, i) => (
                            <React.Fragment key={i}>
                              {part}
                              {i < parts.length - 1 && (
                                <span className="font-bold text-brand">{t.highlight}</span>
                              )}
                            </React.Fragment>
                          ))
                        ) : (
                          t.value
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>

            <Button size="lg" onClick={handleBonus} className="w-full lg:w-auto">
              {workflow.bonus.cta}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
