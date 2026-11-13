"use client";

// ВРЕМЕННАЯ панель подбора параметров разгорания слов (шаг 4). Показывается только по адресу
// /?tune-words=1 (или с флагом в localStorage), посетители её не видят; значения живут в
// localStorage браузера и применяются на лету через событие WORD_REVEAL_PARAMS_EVENT. После
// подбора владелец сообщает значения, они зашиваются в WORD_REVEAL_DEFAULTS, а этот файл
// удаляется вместе с подключением в layout.
import { useEffect, useState } from "react";
import {
  WORD_REVEAL_DEFAULTS,
  WORD_REVEAL_RANGES,
  normalizeParams,
  type WordRevealParams,
} from "@core/domain/layout/word-reveal";
import { WORD_REVEAL_PARAMS_EVENT } from "@/features/landing/components/layout/WordReveal";

const STORAGE_KEY = "vrk:word-reveal";
const FLAG_KEY = "vrk:tune-words";

const LABELS: Record<keyof WordRevealParams, string> = {
  readingLine: "Лінія читання (частка висоти екрана)",
  minOpacity: "Мінімальна яскравість",
  band: "Смуга розгорання (частка висоти екрана)",
  spread: "Зсув у рядку (частка висоти екрана)",
};

function readStored(): WordRevealParams | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeParams(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function WordRevealTuner() {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<WordRevealParams>(WORD_REVEAL_DEFAULTS);

  useEffect(() => {
    let enabled = false;
    try {
      const q = new URLSearchParams(window.location.search).get("tune-words");
      if (q === "1") {
        localStorage.setItem(FLAG_KEY, "1");
        enabled = true;
      } else if (q === "0") {
        localStorage.removeItem(FLAG_KEY);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        enabled = localStorage.getItem(FLAG_KEY) === "1";
      }
    } catch {
      enabled = false;
    }
    if (!enabled) return;
    const stored = readStored() ?? WORD_REVEAL_DEFAULTS;
    setParams(stored);
    setOpen(true);
    window.dispatchEvent(new CustomEvent(WORD_REVEAL_PARAMS_EVENT, { detail: stored }));
  }, []);

  if (!open) return null;

  const update = (key: keyof WordRevealParams, value: number) => {
    const next = normalizeParams({ ...params, [key]: value });
    setParams(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* приватный режим */
    }
    window.dispatchEvent(new CustomEvent(WORD_REVEAL_PARAMS_EVENT, { detail: next }));
  };

  const reset = () => {
    setParams(WORD_REVEAL_DEFAULTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* приватный режим */
    }
    window.dispatchEvent(new CustomEvent(WORD_REVEAL_PARAMS_EVENT, { detail: WORD_REVEAL_DEFAULTS }));
  };

  return (
    <div
      role="group"
      aria-label="Налаштування розгорання слів"
      className="fixed bottom-3 left-3 z-[90] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-bg-line bg-bg-card/95 p-3 text-xs text-white/80 shadow-card backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-white">Розгорання слів (тимчасово)</span>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-1 text-white/60 hover:text-white">
          ✕
        </button>
      </div>
      {(Object.keys(LABELS) as (keyof WordRevealParams)[]).map((key) => {
        const [lo, hi] = WORD_REVEAL_RANGES[key];
        return (
          <label key={key} className="mb-2 block">
            <span className="flex justify-between">
              <span>{LABELS[key]}</span>
              <span className="tabular-nums text-brand">{params[key].toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={lo}
              max={hi}
              step={0.01}
              value={params[key]}
              onChange={(e) => update(key, Number(e.target.value))}
              className="mt-1 w-full accent-brand"
            />
          </label>
        );
      })}
      <div className="mt-2 flex items-center justify-between gap-2">
        <code className="truncate text-[10px] text-white/50">{JSON.stringify(params)}</code>
        <button type="button" onClick={reset} className="shrink-0 rounded border border-bg-line px-2 py-1 hover:bg-bg-soft">
          Скинути
        </button>
      </div>
    </div>
  );
}
