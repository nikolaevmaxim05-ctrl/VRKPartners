"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attachWordReveal, type WordRevealController } from "@/features/landing/lib/word-reveal";
import { normalizeParams, type WordRevealParams } from "@core/domain/layout/word-reveal";

/** Подія панелі налаштування (тимчасова): нові параметри → перерахунок без перезавантаження. */
export const WORD_REVEAL_PARAMS_EVENT = "vrk:word-reveal-params";

/**
 * Вмикає розгорання слів у всіх контейнерах [data-word-reveal] сторінки (крок 4 мобільних
 * анімацій). Живе в layout сайту поруч із FitText; при зміні маршруту переміряє заново
 * (компонент не демонтується при клієнтській навігації). Без JS і в режимі «менше руху» слова
 * лишаються яскравими.
 */
export function WordReveal() {
  const pathname = usePathname();
  const ctrl = useRef<WordRevealController | null>(null);

  useEffect(() => {
    const c = attachWordReveal(document);
    ctrl.current = c;
    const onParams = (e: Event) => {
      c.setParams(normalizeParams((e as CustomEvent<Partial<WordRevealParams>>).detail));
    };
    window.addEventListener(WORD_REVEAL_PARAMS_EVENT, onParams);
    return () => {
      window.removeEventListener(WORD_REVEAL_PARAMS_EVENT, onParams);
      c.destroy();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.refresh();
  }, [pathname]);

  return null;
}
