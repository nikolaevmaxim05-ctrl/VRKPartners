"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { track } from "@/shared/lib/analytics";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { hasText } from "@core/domain/content/messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";

// Десктоп: больше стольких шагов — листаем страницами со стрелками (иначе тесно).
const DESKTOP_PAGINATE_THRESHOLD = 10;
const DESKTOP_PAGE_SIZE = 8;

export function Process({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { openLead } = useLeadModal();
  const { workflow } = useSiteMessages();

  // Номер шага — по позиции среди видимых (пустой шаг не выводится), не из данных.
  const steps = workflow.steps.filter((s) => hasText(s.title)).map((s, i) => ({ n: i + 1, title: s.title }));
  const terms = workflow.bonus.terms.filter((t) => hasText(t.label));
  const paginated = steps.length > DESKTOP_PAGINATE_THRESHOLD;
  const pageCount = paginated ? Math.ceil(steps.length / DESKTOP_PAGE_SIZE) : 1;
  const [page, setPage] = React.useState(0);
  const safePage = Math.min(page, pageCount - 1);

  // Один шаг таймлайна (переиспользуем в простом и в листаемом виде).
  const renderStep = (step: { n: number; title: string }) => (
    <li key={step.n} className="relative flex flex-col items-center px-2 text-center">
      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink ring-4 ring-bg-soft">
        {step.n}
      </span>
      <h3 className="mt-3 text-sm font-semibold leading-snug text-white">{step.title}</h3>
    </li>
  );

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
          <Title data-fit className="h2">{nbHyphen(workflow.title)}</Title>
        </div>

        {/* Мобильный: компактный вертикальный таймлайн */}
        <ol data-items={steps.length} className="reveal-stagger relative ml-3 mt-8 space-y-4 border-l-2 border-bg-line lg:hidden">
          {steps.map((step) => (
            <li key={step.n} className="relative flex min-h-[1.75rem] items-center pl-6">
              <span className="absolute left-0 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-ink ring-4 ring-bg-soft">
                {step.n}
              </span>
              <h3 className="text-sm font-semibold leading-snug text-white">{step.title}</h3>
            </li>
          ))}
        </ol>

        {/* Десктоп: горизонтальный таймлайн; при большом кол-ве шагов — листание стрелками */}
        <div className="mt-14 hidden lg:block">
          {!paginated ? (
            <ol
              className="reveal-stagger relative grid"
              style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}
            >
              <div
                className="absolute top-5 h-0.5 bg-bg-line"
                style={{ left: `${50 / Math.max(steps.length, 1)}%`, right: `${50 / Math.max(steps.length, 1)}%` }}
                aria-hidden="true"
              />
              {steps.map(renderStep)}
            </ol>
          ) : (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label={workflow.prevAria}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bg-line text-white/70 transition-colors hover:border-brand/50 hover:text-white disabled:opacity-30 disabled:hover:border-bg-line disabled:hover:text-white/70"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* Вьюпорт с плавным горизонтальным слайдом между страницами */}
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="flex transition-transform duration-700 ease-in-out"
                  style={{ transform: `translateX(-${safePage * 100}%)` }}
                >
                  {Array.from({ length: pageCount }).map((_, p) => {
                    const pageSteps = steps.slice(p * DESKTOP_PAGE_SIZE, p * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE);
                    const pcols = Math.max(pageSteps.length, 1);
                    const isFirst = p === 0;
                    const isLast = p === pageCount - 1;
                    return (
                      <ol
                        key={p}
                        className="relative grid w-full shrink-0"
                        style={{ gridTemplateColumns: `repeat(${pcols}, minmax(0, 1fr))` }}
                      >
                        {/* На непоследней странице линия тянется до края (намёк, что есть продолжение),
                            и наоборот — чтобы во время слайда линия оставалась сплошной между страницами. */}
                        <div
                          className="absolute top-5 h-0.5 bg-bg-line"
                          style={{
                            left: isFirst ? `${50 / pcols}%` : '0',
                            right: isLast ? `${50 / pcols}%` : '0',
                          }}
                          aria-hidden="true"
                        />
                        {pageSteps.map(renderStep)}
                      </ol>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                aria-label={workflow.nextAria}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bg-line text-white/70 transition-colors hover:border-brand/50 hover:text-white disabled:opacity-30 disabled:hover:border-bg-line disabled:hover:text-white/70"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Подблок: бонус от Google */}
        <div className="reveal mt-12 overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-bg-card to-bg-card p-6 sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h3 data-fit className="text-2xl font-bold text-white">{nbHyphen(workflow.bonus.title)}</h3>
              <p className="mt-2 max-w-2xl text-sm text-white/65">{workflow.bonus.desc}</p>

              <dl data-items={terms.length} className="mt-5 grid gap-3 sm:grid-cols-3">
                {terms.map((t, ti) => {
                  const parts = t.highlight ? t.value.split(t.highlight) : [t.value];
                  return (
                    <div key={ti} className="rounded-xl border border-bg-line bg-bg-soft p-3">
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

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col">
              <Button size="lg" onClick={handleBonus} className="w-full sm:flex-1 lg:w-auto lg:flex-none">
                {workflow.bonus.cta}
              </Button>
              <TelegramCtaButton placement="process" size="lg" className="w-full sm:flex-1 lg:w-auto lg:flex-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
