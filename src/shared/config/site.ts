/**
 * Техническая конфигурация сайта. ТЕКСТЫ сайта здесь не живут — они в src/messages/uk.json
 * (дефолты) и редактируются клиентом из админки (раздел 9 стандарта).
 */

/** Публичный адрес сайта: env NEXT_PUBLIC_SITE_URL; фолбэк — только для локальной разработки. */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vrk.com.ua";
