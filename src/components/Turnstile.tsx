"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile — антибот-віджет («Підтвердьте, що ви людина»).
 *
 * Рендериться лише якщо задано NEXT_PUBLIC_TURNSTILE_SITE_KEY. Без ключа
 * компонент нічого не показує — форма працює у демо-режимі без капчі.
 *
 * Site key (публічний) — безпечний у клієнтському коді. Секретний ключ
 * лишається на сервері (див. /api/lead) і в код не потрапляє.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      language?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Завантажує скрипт Turnstile один раз на сторінку. */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject());
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  /** Викликається з токеном після успішної перевірки. */
  onVerify: (token: string) => void;
  /** Викликається коли токен прострочився або сталася помилка. */
  onExpire?: () => void;
}

/** Чи налаштований Turnstile (є site key). */
export const turnstileEnabled = Boolean(SITE_KEY);

export function Turnstile({ onVerify, onExpire }: TurnstileProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  // Колбеки у ref, щоб не перезапускати ефект рендеру віджета.
  const cb = React.useRef({ onVerify, onExpire });
  cb.current = { onVerify, onExpire };

  React.useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          language: "uk",
          callback: (token) => cb.current.onVerify(token),
          "expired-callback": () => cb.current.onExpire?.(),
          "error-callback": () => cb.current.onExpire?.(),
        });
      })
      .catch(() => {
        /* мережа/скрипт недоступні — форму не блокуємо жорстко */
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* віджет уже знятий */
        }
      }
    };
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={ref} className="flex min-h-[65px] justify-center" />;
}
