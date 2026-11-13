"use client";

import { useEffect } from "react";

/**
 * Докрутка до секции-якоря после перехода на главную с другой страницы
 * (напр. с /thanks по ссылке "/#services"). Браузер обычно сам скроллит
 * к #hash при загрузке, но секции берут контент из провайдера и шрифты
 * подгружаются — layout может немного сдвинуться и нативный скролл промахнуться.
 * Поэтому после монтирования, если есть hash, докручиваем до элемента (с ретраями,
 * пока секция появится). behavior:"auto" наследует CSS scroll-behavior:
 * плавно, а при prefers-reduced-motion — мгновенно. scroll-margin-top в globals.css
 * учитывает фиксированный хедер.
 *
 * На главной клики по якорям в пределах страницы работают нативно (это не монтирование),
 * так что этот эффект им не мешает — он срабатывает только один раз при загрузке с hash.
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
    // Даём браузеру отрендерить секции, потом докручиваем.
    const t = window.setTimeout(tick, 60);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
