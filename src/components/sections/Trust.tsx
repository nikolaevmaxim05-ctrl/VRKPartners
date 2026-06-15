"use client";

import * as React from "react";
import Image from "next/image";
import { BadgeCheck, Check, Quote, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLeadModal } from "@/components/ModalProvider";
import { track, analyticsEvents } from "@/lib/analytics";
import { trust } from "@/config/site";
import { cn } from "@/lib/utils";

export function Trust() {
  const { openLead } = useLeadModal();

  // Рівень 1 — ніша, Рівень 2 — кейс усередині ніші.
  const [nicheIdx, setNicheIdx] = React.useState(0);
  const [caseIdx, setCaseIdx] = React.useState(0);

  const group = trust.caseGroups[nicheIdx] ?? trust.caseGroups[0];
  const current = group?.cases[caseIdx] ?? group?.cases[0];
  // Кейси мають різні набори полів (task/approach/image — опційні)
  const cur = current as unknown as {
    id: string;
    client: string;
    title: string;
    task?: string;
    image?: string;
    metrics: readonly { value: string; label: string }[];
    approach?: readonly string[];
  };

  const selectNiche = (i: number) => {
    setNicheIdx(i);
    setCaseIdx(0); // скидаємо вибір кейсу при зміні ніші
    track("case_niche", { niche: trust.caseGroups[i]?.niche });
  };

  const selectCase = (i: number) => {
    setCaseIdx(i);
    track("case_open", {
      niche: group?.niche,
      client: group?.cases[i]?.client,
    });
  };

  const handleConsult = () => {
    track(analyticsEvents.ctaClick, { source: "trust" });
    openLead({
      title: "Отримати консультацію",
      description: "Розкажемо, як отримати схожий результат у вашій ніші.",
      source: "trust",
      submitLabel: "Отримати консультацію",
    });
  };

  if (!group || !current) return null;

  return (
    <section id="cases" className="section">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          {/* Ліва колонка: довіра */}
          <div className="reveal min-w-0">
            <h2 className="h2">{trust.title}</h2>

            <ul className="mt-6 space-y-3">
              {trust.facts.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-white/75">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3">
              <BadgeCheck className="h-7 w-7 text-brand" />
              <span className="text-sm font-semibold text-white">
                Офіційний Google Partner
              </span>
            </div>

            {/* хайлайти-цифри: рядки на мобільному, колонки на десктопі */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {trust.highlights.map((h) => (
                <div
                  key={h.label}
                  className="flex items-center gap-3 rounded-2xl border border-bg-line bg-bg-card p-4 text-left shadow-card sm:flex-col sm:gap-1 sm:text-center"
                >
                  <div className="shrink-0 text-2xl font-bold text-brand">{h.value}</div>
                  <div className="text-xs leading-snug text-white/55">{h.label}</div>
                </div>
              ))}
            </div>

            {/* ніші */}
            <div className="mt-8">
              <p className="text-xs uppercase tracking-widest text-white/35">Ніші</p>
              <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-x-visible lg:pb-0">
                {trust.niches.map((n) => (
                  <li
                    key={n}
                    className="shrink-0 rounded-full border border-bg-line bg-bg-soft px-3 py-1.5 text-sm text-white/75"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <Button onClick={handleConsult}>{trust.ctaSecondary}</Button>
            </div>
          </div>

          {/* Права колонка: кейси — ніша → кейс → контент */}
          <div className="reveal min-w-0 rounded-2xl border border-bg-line bg-bg-card p-5 shadow-card sm:p-7">
            <div className="flex items-center gap-2">
              <Quote className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-bold text-white">Кейси та результати</h3>
            </div>
            <p className="mt-1 text-sm text-white/50">{trust.caseHint}</p>

            {/* Крок 1 — вибір ніші */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                1. Ніша
              </p>
              <div
                role="tablist"
                aria-label="Ніші кейсів"
                className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-x-visible lg:px-0 lg:pb-0"
              >
                {trust.caseGroups.map((g, i) => (
                  <button
                    key={g.id}
                    role="tab"
                    aria-selected={nicheIdx === i}
                    onClick={() => selectNiche(i)}
                    className={cn(
                      "btn-focus shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      nicheIdx === i
                        ? "bg-brand text-brand-ink"
                        : "border border-bg-line bg-bg-soft text-white/70 hover:text-white"
                    )}
                  >
                    {g.niche}
                    {g.cases.length > 1 && (
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 text-xs",
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
                2. Кейс
              </p>
              <div
                role="tablist"
                aria-label="Кейси ніші"
                className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-x-visible lg:px-0 lg:pb-0"
              >
                {group.cases.map((c, i) => (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={caseIdx === i}
                    onClick={() => selectCase(i)}
                    className={cn(
                      "btn-focus inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
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
              key={`${group.id}-${cur.id}`}
              role="tabpanel"
              className="mt-6 animate-fade-up border-t border-bg-line pt-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-xl font-bold text-white">{cur.client}</h4>
                <span className="text-sm text-white/45">{cur.title}</span>
              </div>
              {cur.task && (
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  <span className="font-semibold text-white/80">Завдання: </span>
                  {cur.task}
                </p>
              )}

              {/* метрики */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {cur.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-bg-line bg-bg-soft p-3 text-center"
                  >
                    <div className="text-base font-bold leading-tight text-brand sm:text-lg">
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
                    alt={`Результати реклами — ${cur.client}`}
                    width={1400}
                    height={285}
                    className="h-auto w-full"
                  />
                </div>
              )}

              {/* підходи */}
              {cur.approach && cur.approach.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  Підходи до результату
                </p>
                <ul className="mt-3 space-y-2">
                  {cur.approach.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
