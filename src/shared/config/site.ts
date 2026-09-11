/**
 * Технічна конфігурація сайту. ТЕКСТИ сайту тут не живуть — вони в src/messages/uk.json
 * (дефолти) і редагуються клієнтом з адмінки (розділ 9 стандарту).
 */

/** Публічна адреса сайту: env NEXT_PUBLIC_SITE_URL; фолбек — лише для локальної розробки. */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vrk.com.ua";
