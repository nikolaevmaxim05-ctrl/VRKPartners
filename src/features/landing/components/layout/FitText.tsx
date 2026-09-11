"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { fitAll } from "@/features/landing/lib/fit-text";

/**
 * Запускає підгонку заголовків (розділ 12, п. 1) після монтування, після завантаження шрифтів
 * і при зміні розміру вікна. Живе в layout сайту; переганяє при зміні маршруту.
 * Стартовий стан — видимий: без JS заголовки лишаються з CSS-розміром (clamp).
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
    // Шрифт може довантажитись пізніше — ширина слів зміниться.
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
