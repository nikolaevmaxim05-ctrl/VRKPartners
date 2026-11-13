"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { fitAll } from "@/features/landing/lib/fit-text";

/**
 * Запускает подгонку заголовков (раздел 12, п. 1) после монтирования, после загрузки шрифтов
 * и при изменении размера окна. Живёт в layout сайта; перегоняет при смене маршрута.
 * Стартовое состояние — видимое: без JS заголовки остаются с CSS-размером (clamp).
 */
export function FitText() {
  const pathname = usePathname();

  useEffect(() => {
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitAll(document));
    };
    run();
    // Шрифт может догрузиться позже — ширина слов изменится.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(run).catch(() => {});
    }
    window.addEventListener("resize", run);
    return () => {
      window.removeEventListener("resize", run);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
}
