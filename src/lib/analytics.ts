/**
 * Тонка обгортка над dataLayer (GTM). Усі події лідгену — через track().
 * Без сторонніх скриптів у демо: якщо GTM не підключений, події просто
 * накопичуються у dataLayer і не зашкодять.
 */

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...params });
}

export const analyticsEvents = {
  ctaClick: "cta_click",
  formOpen: "form_open",
  formSubmit: "form_submit",
  formSuccess: "form_success",
  formError: "form_error",
} as const;
