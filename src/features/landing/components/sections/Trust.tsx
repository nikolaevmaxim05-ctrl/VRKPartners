"use client";

import * as React from "react";
import Image from "next/image";
import { BadgeCheck, Check, Quote, ChevronRight, ExternalLink, ZoomIn } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
import { ImageLightbox } from "@/features/landing/components/ui/ImageLightbox";
import { attachCaseImageZoom } from "@/features/landing/lib/case-image-zoom";
import { TelegramCtaButton } from "@/features/landing/components/ui/TelegramCtaButton";
import { useLeadModal } from "@/features/landing/components/forms/ModalProvider";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { contentList, hasText } from "@core/domain/content/messages";
import type { CaseItem } from "@core/domain/content/site-messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";
import { fitAll } from "@/features/landing/lib/fit-text";
import { track } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";

export function Trust({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { openLead } = useLeadModal();
  const { trust, services } = useSiteMessages();

  // Уровень 1 — ниша, Уровень 2 — кейс внутри ниши.
  const [nicheIdx, setNicheIdx] = React.useState(0);
  const [caseIdx, setCaseIdx] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Панель кейса пересоздаётся (key) — новые [data-fit] метрики нужно подогнать без resize.
  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => fitAll(el));
    return () => cancelAnimationFrame(raf);
  }, [nicheIdx, caseIdx]);

  // Шаг 5 мобильных анимаций: скриншот кейса увеличивается до ширины экрана при приближении к центру
  // (< sm; DOM — features/landing/lib/case-image-zoom). Блок кейса перемонтируется (key), поэтому
  // эффект подключается заново на каждую смену ниши/кейса. Тап по картинке — лайтбокс (все устройства:
  // hover-превью у кейсов нет), кнопка-триггер появляется после монтирования (SSR — div).
  const zoomRef = React.useRef<HTMLDivElement>(null);
  const zoomBtnRef = React.useRef<HTMLButtonElement>(null);
  const [zoomable, setZoomable] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  React.useEffect(() => setZoomable(true), []);
  React.useEffect(() => {
    const el = zoomRef.current;
    if (!el) return;
    const ctrl = attachCaseImageZoom(el);
    return () => ctrl.destroy();
  }, [nicheIdx, caseIdx]);
  const closeLightbox = React.useCallback(() => setLightbox(false), []);

  // Пустые ниши/кейсы (без названия) не выводятся; у кейсов есть опциональные task/approach/image.
  const caseGroups = trust.caseGroups
    .filter((g) => hasText(g.niche))
    .map((g) => ({ ...g, cases: (g.cases ?? []).filter((c) => hasText(c.client)) }))
    .filter((g) => g.cases.length > 0);
  const group = caseGroups[nicheIdx] ?? caseGroups[0];
  const current = group?.cases[caseIdx] ?? group?.cases[0];
  const cur = current as CaseItem;
  const facts = contentList(trust.facts);
  const highlights = trust.highlights.filter((h) => hasText(h.value));
  const metrics = (cur?.metrics ?? []).filter((m) => hasText(m.value));

  const selectNiche = (i: number) => {
    setNicheIdx(i);
    setCaseIdx(0); // сбрасываем выбор кейса при смене ниши
    track("case_niche_click", { niche: caseGroups[i]?.niche });
  };

  const selectCase = (i: number) => {
    setCaseIdx(i);
    track("case_open", {
      niche: group?.niche,
      client: group?.cases[i]?.client,
    });
  };

  const handleConsult = () => {
    track("trust_cta_click", { source: "trust" });
    openLead({
      title: trust.modalTitle,
      description: trust.modalDescription,
      source: "trust",
      submitLabel: trust.submitLabel,
    });
  };

  const hasCases = !!group && !!current;

  // < sm: overflow-x: clip на секции (не hidden — не создаёт скролл-контейнер, якорь scroll-margin
  // работает) — страховка от горизонтального скролла при увеличенном скриншоте кейса.
  return (
    <section id="cases" className="section max-sm:overflow-x-clip">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          {/* Левая колонка: доверие */}
          <div className="reveal min-w-0">
            <Title data-fit className="h2">{nbHyphen(trust.title)}</Title>

            <ul className="mt-6 space-y-3">
              {facts.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-white/75">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {hasText(trust.partnerLabel) && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3">
                <BadgeCheck className="h-7 w-7 text-brand" />
                <span className="text-sm font-semibold text-white">{trust.partnerLabel}</span>
              </div>
            )}

            {/* хайлайты-цифры: строки на мобильном, колонки на десктопе */}
            <div data-items={highlights.length} className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {highlights.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-bg-line bg-bg-card p-4 text-left shadow-card sm:flex-col sm:gap-1 sm:text-center"
                >
                  <div data-fit data-fit-row="highlights" className="min-w-0 text-2xl font-bold text-brand">{h.value}</div>
                  <div className="text-xs leading-snug text-white/55">{h.label}</div>
                </div>
              ))}
            </div>

            {/* Блок «Ніші» (подпись + чипы) убран по решению владельца 2026-09-13; переключатель ниш
                в карточке кейсов справа остаётся. Кнопки стоят на том же отступе (mt-8) от цифр. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {hasText(trust.ctaSecondary) && <Button onClick={handleConsult}>{trust.ctaSecondary}</Button>}
              <TelegramCtaButton placement="trust" size="md" />
            </div>
          </div>

          {/* Правая колонка: кейсы — ниша → кейс → контент (без кейсов — не выводится).
              Жёлтая обводка со свечением цвета бренда по периметру (токен shadow-glowSoft) — решение
              владельца 2026-09-14; серая рамка на аврора-фоне читалась как беловатое свечение. */}
          {hasCases && (
          <div className="reveal min-w-0 rounded-2xl border border-brand/40 bg-bg-card p-5 shadow-glowSoft sm:p-7">
            <div className="flex items-center gap-2">
              <Quote className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-bold text-white">{trust.casesTitle}</h3>
            </div>
            {hasText(trust.caseHint) && <p className="mt-1 text-sm text-white/50">{trust.caseHint}</p>}

            {/* Шаг 1 — выбор ниши */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                {trust.nicheStep}
              </p>
              <div
                role="tablist"
                aria-label={trust.nichesAria}
                className="flex flex-wrap gap-2"
              >
                {caseGroups.map((g, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={nicheIdx === i}
                    onClick={() => selectNiche(i)}
                    className={cn(
                      "btn-focus min-w-0 max-w-full rounded-full px-4 py-2 text-left text-sm font-medium transition-colors",
                      nicheIdx === i
                        ? "bg-brand text-brand-ink"
                        : "border border-bg-line bg-bg-soft text-white/70 hover:text-white"
                    )}
                  >
                    {g.niche}
                    {g.cases.length > 1 && (
                      <span
                        className={cn(
                          "ml-1.5 shrink-0 rounded-full px-1.5 text-xs",
                          nicheIdx === i ? "bg-black/15" : "bg-white/10"
                        )}
                      >
                        {g.cases.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Шаг 2 — выбор кейса внутри ниши */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                {trust.caseStep}
              </p>
              <div
                role="tablist"
                aria-label={trust.casesAria}
                className="flex flex-wrap gap-2"
              >
                {group.cases.map((c, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={caseIdx === i}
                    onClick={() => selectCase(i)}
                    className={cn(
                      "btn-focus inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-xl border px-3.5 py-2 text-left text-sm font-medium transition-colors",
                      caseIdx === i
                        ? "border-brand/60 bg-brand/10 text-white"
                        : "border-bg-line bg-bg-soft text-white/60 hover:text-white"
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        caseIdx === i ? "text-brand" : "text-white/30"
                      )}
                    />
                    {c.client}
                  </button>
                ))}
              </div>
            </div>

            {/* Шаг 3 — контент кейса */}
            <div
              key={`${nicheIdx}-${caseIdx}`}
              ref={panelRef}
              role="tabpanel"
              className="mt-6 animate-fade-up border-t border-bg-line pt-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {cur.href ? (
                  <a
                    href={cur.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={() =>
                      track("case_site_click", { client: cur.client, href: cur.href })
                    }
                    className="btn-focus group inline-flex items-center gap-1.5 rounded text-xl font-bold text-sky-400 underline decoration-sky-400/40 decoration-2 underline-offset-4 transition-colors hover:text-sky-300 hover:decoration-sky-300"
                  >
                    {cur.client}
                    <ExternalLink className="h-4 w-4 opacity-70 transition-opacity group-hover:opacity-100" />
                  </a>
                ) : (
                  <h4 className="text-xl font-bold text-white">{cur.client}</h4>
                )}
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-sm font-semibold text-brand ring-1 ring-brand/25">
                  {cur.title}
                </span>
              </div>
              {cur.task && (
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  <span className="font-semibold text-white/80">{trust.taskLabel} </span>
                  {cur.task}
                </p>
              )}

              {/* метрики */}
              <div data-items={metrics.length} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {metrics.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-bg-line bg-bg-soft p-3 text-center"
                  >
                    <div data-fit data-fit-row="metrics" className="text-base font-bold leading-tight text-brand sm:text-lg">
                      {m.value}
                    </div>
                    <div className="mt-1 text-[11px] leading-tight text-white/50">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* скрин результатов */}
              {cur.image && (
                <>
                  {/* Обёртка [data-case-zoom] масштабируется на мобильном (transform, запас по вертикали
                      через --case-zoom-reserve); внутри — кнопка-триггер лайтбокса (после гидрации). */}
                  <div ref={zoomRef} data-case-zoom className="case-zoom relative mt-5">
                    {(() => {
                      const inner = (
                        <>
                          <Image
                            src={cur.image}
                            alt={`${trust.imageAlt} — ${cur.client}`}
                            width={1400}
                            height={285}
                            className="h-auto w-full"
                          />
                          {zoomable && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </>
                      );
                      const cls = "case-zoom-inner relative block w-full overflow-hidden rounded-xl border border-bg-line bg-white";
                      return zoomable ? (
                        <button
                          ref={zoomBtnRef}
                          type="button"
                          data-zoom-trigger
                          aria-label={`${services.zoomLabel}: ${cur.client}`}
                          onClick={() => setLightbox(true)}
                          className={cn(cls, "btn-focus text-left")}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className={cls}>{inner}</div>
                      );
                    })()}
                  </div>
                  {zoomable && (
                    <ImageLightbox
                      open={lightbox}
                      onClose={closeLightbox}
                      src={cur.image}
                      alt={`${trust.imageAlt} — ${cur.client}`}
                      returnFocusTo={zoomBtnRef.current}
                    />
                  )}
                </>
              )}

              {/* подходы */}
              {contentList(cur.approach).length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  {trust.approachTitle}
                </p>
                <ul className="mt-3 space-y-2">
                  {contentList(cur.approach).map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
