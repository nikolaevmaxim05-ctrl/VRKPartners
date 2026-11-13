// analytics.ts — единая точка отправки аналитических событий
// dataLayer (GTM) + прямой gtag('event') (GA4/AW-теги) + Plausible.
// SSR-safe.
//
// Промпт 016: имя события и enabled/disabled резолвятся через
// window.__analyticsEvents (инлайнится сервером в (marketing)/layout.tsx).
// Нет конфига → поведение полностью текущее (мягкая деградация).
//
// Промпт 018: каждая точка может иметь МАССИВ eventNames — для каждого
// имени отправляется отдельный push в dataLayer, gtag и Plausible.

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
    /** gtag.js — определяется inline-скриптами тегов из (marketing)/layout.tsx */
    gtag?: (...args: unknown[]) => void;
    /** Конфиг событий из админки — инлайнится сервером, может отсутствовать */
    __analyticsEvents?: AnalyticsEventsConfig;
    /** send_to Ads-тегов с conversion label (AW-XXX/LABEL) — инлайнится сервером */
    __awConversions?: string[];
  }
}

// --- Конверсия Google Ads при отправке формы (раздел 15) ---
// gtag('event','conversion',{send_to}) для каждого Ads-тега с conversion label.
// Только gtag: в dataLayer и Plausible НЕ дублируется. Вызывать ПОСЛЕ gtag('set','user_data')
// и ДО track('form_submit_success').
export function fireAdsConversions(): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const list = Array.isArray(window.__awConversions) ? window.__awConversions : [];
  for (const sendTo of list) {
    try {
      window.gtag("event", "conversion", { send_to: sendTo });
    } catch {
      // Аналитика никогда не должна ломать UI
    }
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

// --- Прямой вызов gtag('event', ...) для GA4/AW-тегов, подключённых напрямую ---
// window.gtag существует только если layout отрендерил хотя бы один тег.
function trackGtag(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params ?? {});
  } catch {
    // Аналитика никогда не должна ломать UI
  }
}

// --- Универсальная функция — резолвит маппинг и пушит во все каналы ---
// key — канонический ключ из src/lib/analytics-registry.ts
// Промпт 018: один track() → несколько событий (для каждого eventName в массиве)
export function track(key: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  try {
    const { enabled, eventNames } = resolveAnalyticsEvent(
      key,
      window.__analyticsEvents
    );

    if (!enabled) return; // выключено в админке — no-op
    if (eventNames.length === 0) return; // пустой список — no-op

    for (const eventName of eventNames) {
      trackEvent(eventName, params);
      trackGtag(eventName, params);
      trackPlausible(eventName, params);
    }
  } catch {
    // Аналитика никогда не должна ломать UI
  }
}

// --- Декларативная привязка события к элементу ---
// Возвращает props для DOM-элемента: вешает onClick(track) и помечает элемент
// атрибутом data-analytics-event (точка опоры для E2E-тестов и dev-инспектора).
// key типизирован AnalyticsKey → опечатка/удалённая точка падают на компиляции.
//
// Использование:
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
