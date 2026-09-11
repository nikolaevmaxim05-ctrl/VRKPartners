"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attachParallax, type ParallaxController } from "@/features/landing/lib/parallax";

/**
 * Вмикає паралакс фону (шар [data-site-bg] із SiteBackground) після гідрації. Живе в layout
 * сайту поруч із RevealObserver/FitText; при зміні маршруту переміряє висоту сторінки
 * (компонент не демонтується при клієнтській навігації). Без JS і в режимі «менше руху»
 * фон лишається у стартовому стані — статичний, на всю сторінку.
 */
export function SiteParallax() {
  const pathname = usePathname();
  const ctrl = useRef<ParallaxController | null>(null);

  useEffect(() => {
    const layer = document.querySelector<HTMLElement>("[data-site-bg]");
    if (!layer) return;
    const c = attachParallax(layer);
    ctrl.current = c;
    return () => {
      c.destroy();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.refresh();
  }, [pathname]);

  return null;
}
