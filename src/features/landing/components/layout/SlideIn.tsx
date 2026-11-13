"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attachSlideIn, type SlideInController } from "@/features/landing/lib/slide-in";
import { SLIDE_IN_DEFAULTS, type SlideInParams } from "@core/domain/layout/slide-in";

/** Событие подбора параметров (превью/отладка): новые значения → пересчёт без перезагрузки. */
export const SLIDE_IN_PARAMS_EVENT = "vrk:slide-in-params";

/**
 * Включает выезд слева для всех пунктов [data-slide-in] страницы (блок «Що ви отримуєте?»). Живёт в
 * layout сайта рядом с WordReveal/FitText — атрибутный подход: эффект переносится в другой блок
 * атрибутами, без нового кода. При смене маршрута пересобирает пункты (компонент не демонтируется при
 * клиентской навигации). Без JS и в режиме «меньше движения» всё на месте.
 */
export function SlideIn() {
  const pathname = usePathname();
  const ctrl = useRef<SlideInController | null>(null);

  useEffect(() => {
    const c = attachSlideIn(document);
    ctrl.current = c;
    const onParams = (e: Event) => {
      c.setParams({ ...SLIDE_IN_DEFAULTS, ...((e as CustomEvent<Partial<SlideInParams>>).detail ?? {}) });
    };
    window.addEventListener(SLIDE_IN_PARAMS_EVENT, onParams);
    return () => {
      window.removeEventListener(SLIDE_IN_PARAMS_EVENT, onParams);
      c.destroy();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.refresh();
  }, [pathname]);

  return null;
}
