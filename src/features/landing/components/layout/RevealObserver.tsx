"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Плавное появление элементов при скролле.
 * Наблюдает за элементами с классами .reveal / .reveal-stagger и добавляет
 * .is-visible, когда они попадают во вьюпорт. Анимация включается только при
 * наличии JS (класс .js-reveal на <html>), так что без JS контент видим сразу.
 *
 * Пересканирование при смене маршрута: компонент живёт в layout и не демонтируется
 * при клиентской навигации, так что без зависимости от pathname новые элементы
 * страницы оставались бы скрытыми (пустая страница после перехода).
 */
export function RevealObserver() {
  const pathname = usePathname();

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");

    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal, .reveal-stagger")
    );

    // Если IntersectionObserver недоступен — показываем всё сразу.
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    els.forEach((el) => observer.observe(el));

    // Подстраховка: элементы, которые уже во вьюпорте на момент загрузки.
    requestAnimationFrame(() => {
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      });
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
