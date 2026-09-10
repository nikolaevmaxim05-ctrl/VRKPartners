// analytics.ts — єдина точка відправки аналітичних подій
// dataLayer (GTM) + прямий gtag('event') (GA4/AW-теги) + Plausible.
// SSR-safe.
//
// Промпт 016: ім'я події та enabled/disabled резолвляються через
// window.__analyticsEvents (інлайниться сервером у (marketing)/layout.tsx).
// Немає конфігу → поведінка повністю поточна (м'яка деградація).
//
// Промпт 018: кожна точка може мати МАСИВ eventNames — для кожного
// імені відправляється окремий push у dataLayer, gtag і Plausible.

import {
  resolveAnalyticsEvent,
  type AnalyticsEventsConfig,
  type AnalyticsKey,
} from '@core/domain/analytics/registry'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: (
      eventName: string,
      options?: { props?: Record<string, unknown> }
    ) => void;
    /** gtag.js — визначається inline-скриптами тегів з (marketing)/layout.tsx */
    gtag?: (...args: unknown[]) => void;
    /** Конфіг подій з адмінки — інлайниться сервером, може бути відсутнім */
    __analyticsEvents?: AnalyticsEventsConfig;
  }
}

// --- GTM dataLayer push ---
export function trackEvent(
  name: string,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event: name, ...params });
}

// --- Plausible custom event ---
export function trackPlausible(
  name: string,
  props?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  if (typeof window.plausible !== "function") return;
  window.plausible(name, props ? { props } : undefined);
}

// --- Прямий виклик gtag('event', ...) для GA4/AW-тегів, підключених напряму ---
// window.gtag існує лише якщо layout відрендерив хоча б один тег.
function trackGtag(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params ?? {});
  } catch {
    // Аналітика ніколи не повинна ламати UI
  }
}

// --- Універсальна функція — резолвить маппінг і пушить у всі канали ---
// key — канонічний ключ з src/lib/analytics-registry.ts
// Промпт 018: один track() → декілька подій (для кожного eventName в масиві)
export function track(key: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  try {
    const { enabled, eventNames } = resolveAnalyticsEvent(
      key,
      window.__analyticsEvents
    );

    if (!enabled) return; // вимкнено в адмінці — no-op
    if (eventNames.length === 0) return; // пустий список — no-op

    for (const eventName of eventNames) {
      trackEvent(eventName, params);
      trackGtag(eventName, params);
      trackPlausible(eventName, params);
    }
  } catch {
    // Аналітика ніколи не повинна ламати UI
  }
}

// --- Декларативна привязка події до елемента ---
// Повертає props для DOM-елемента: вішає onClick(track) і мітить елемент
// атрибутом data-analytics-event (точка опори для E2E-тестів і dev-інспектора).
// key типізований AnalyticsKey → опечатка/видалена точка падають на компіляції.
//
// Використання:
//   <Link {...trackProps('header_cta_click', { location: 'header' })}>...</Link>
export function trackProps(
  key: AnalyticsKey,
  params?: Record<string, unknown>
): { 'data-analytics-event': AnalyticsKey; onClick: () => void } {
  return {
    'data-analytics-event': key,
    onClick: () => track(key, params),
  };
}
