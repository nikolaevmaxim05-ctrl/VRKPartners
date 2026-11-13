"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attachWordReveal, type WordRevealController } from "@/features/landing/lib/word-reveal";
import { normalizeParams, type WordRevealParams } from "@core/domain/layout/word-reveal";

/** Событие временной панели настройки: новые параметры → пересчёт без перезагрузки. */
export const WORD_REVEAL_PARAMS_EVENT = "vrk:word-reveal-params";

/**
 * Включает разгорание слов во всех контейнерах [data-word-reveal] страницы (шаг 4 мобильных
 * анимаций). Живёт в layout сайта рядом с FitText; при смене маршрута перемеряет заново
 * (компонент не демонтируется при клиентской навигации). Без JS и в режиме «меньше движения» слова
 * остаются яркими.
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
