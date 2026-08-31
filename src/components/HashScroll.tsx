"use client";

import { useEffect } from "react";

/**
 * Доскрол до секції-якоря після переходу на головну з іншої сторінки
 * (напр. з /thanks за посиланням "/#services"). Браузер зазвичай сам скролить
 * до #hash при завантаженні, але секції беруть контент із провайдера й шрифти
 * підвантажуються — лейаут може трохи зсунутись і нативний скрол промахнутись.
 * Тому після монтування, якщо є hash, доскролюємо до елемента (з ретраями,
 * поки секція з'явиться). behavior:"auto" наслідує CSS scroll-behavior:
 * плавно, а за prefers-reduced-motion — миттєво. scroll-margin-top у globals.css
 * враховує фіксований хедер.
 *
 * На головній кліки по якорях у межах сторінки працюють нативно (це не монтування),
 * тож цей ефект їм не заважає — він спрацьовує лише один раз при завантаженні з hash.
 */
export function HashScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      if (tries++ < 10) window.setTimeout(tick, 50);
    };
    // Даємо браузеру відрендерити секції, потім доскролюємо.
    const t = window.setTimeout(tick, 60);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
