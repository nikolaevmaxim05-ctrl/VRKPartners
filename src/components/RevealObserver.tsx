"use client";

import * as React from "react";

/**
 * Плавна поява елементів при скролі.
 * Спостерігає за елементами з класами .reveal / .reveal-stagger і додає
 * .is-visible, коли вони потрапляють у в'юпорт. Анімація вмикається лише за
 * наявності JS (клас .js-reveal на <html>), тож без JS контент видимий одразу.
 */
export function RevealObserver() {
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");

    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal, .reveal-stagger")
    );

    // Якщо IntersectionObserver недоступний — показуємо все одразу.
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

    // Підстраховка: елементи, що вже у в'юпорті на момент завантаження.
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
  }, []);

  return null;
}
