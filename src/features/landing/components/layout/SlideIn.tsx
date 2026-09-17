"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attachSlideIn, type SlideInController } from "@/features/landing/lib/slide-in";
import { SLIDE_IN_DEFAULTS, type SlideInParams } from "@core/domain/layout/slide-in";

/** Подія підбору параметрів (превʼю/налагодження): нові значення → перерахунок без перезавантаження. */
export const SLIDE_IN_PARAMS_EVENT = "vrk:slide-in-params";

/**
 * Вмикає виїзд зліва для всіх пунктів [data-slide-in] сторінки (блок «Що ви отримуєте?»). Живе в
 * layout сайту поруч із WordReveal/FitText — атрибутний підхід: ефект переноситься в інший блок
 * атрибутами, без нового коду. При зміні маршруту перезбирає пункти (компонент не демонтується при
 * клієнтській навігації). Без JS і в режимі «менше руху» усе на місці.
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
