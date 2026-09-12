"use client";

import * as React from "react";
import Image from "next/image";
import { BadgeCheck, Check, Quote, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";
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
  const { trust } = useSiteMessages();

  // Рівень 1 — ніша, Рівень 2 — кейс усередині ніші.
  const [nicheIdx, setNicheIdx] = React.useState(0);
  const [caseIdx, setCaseIdx] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Панель кейсу пересоздається (key) — нові [data-fit] метрики треба підігнати без resize.
  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => fitAll(el));
    return () => cancelAnimationFrame(raf);
  }, [nicheIdx, caseIdx]);

  // Порожні ніші/кейси (без назви) не виводяться; кейси мають опційні task/approach/image.
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
    setCaseIdx(0); // скидаємо вибір кейсу при зміні ніші
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

  return (
    <section id="cases" className="section">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          {/* Ліва колонка: довіра */}
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

            {/* хайлайти-цифри: рядки на мобільному, колонки на десктопі */}
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

            {/* Блок «Ніші» (підпис + чипи) прибрано за рішенням власника 2026-09-13; перемикач ніш
                у картці кейсів праворуч лишається. Кнопки стоять на тому ж відступі (mt-8) від цифр. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {hasText(trust.ctaSecondary) && <Button onClick={handleConsult}>{trust.ctaSecondary}</Button>}
              <TelegramCtaButton placement="trust" size="md" />
            </div>
          </div>

          {/* Права колонка: кейси — ніша → кейс → контент (без кейсів — не виводиться) */}
          {hasCases && (
          <div className="reveal min-w-0 rounded-2xl border border-bg-line bg-bg-card p-5 shadow-card sm:p-7">
            <div className="flex items-center gap-2">
              <Quote className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-bold text-white">{trust.casesTitle}</h3>
            </div>
            {hasText(trust.caseHint) && <p className="mt-1 text-sm text-white/50">{trust.caseHint}</p>}

            {/* Крок 1 — вибір ніші */}
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

            {/* Крок 2 — вибір кейсу всередині ніші */}
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

            {/* Крок 3 — контент кейсу */}
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

              {/* скрін результатів */}
              {cur.image && (
                <div className="mt-5 overflow-hidden rounded-xl border border-bg-line bg-white">
                  <Image
                    src={cur.image}
                    alt={`${trust.imageAlt} — ${cur.client}`}
                    width={1400}
                    height={285}
                    className="h-auto w-full"
                  />
                </div>
              )}

              {/* підходи */}
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
