// analytics-registry.ts — канонический реестр точек взаимодействия аналитики (промпты 016, 018).
// Используется:
//   • лендингом (lib/analytics.ts) — резолвинг имён событий и enabled/disabled;
//   • (marketing)/layout.tsx — серверное чтение конфига + инлайн window.__analyticsEvents;
//   • admin API (/api/admin/analytics-events) — серверная валидация;
//   • админкой (секция «Події аналітики») — лейблы блоков/взаимодействий.
//
// Ключи реестра = текущие имена в коде (track("...")). Это намеренно:
// без конфига в БД поведение на 100% текущее, GTM-триггеры заказчика не ломаются.
//
// Промпт 018: каждая точка теперь поддерживает МАССИВ имён событий (defaultEventNames),
// чтобы один вызов track() мог генерировать несколько событий (например, ["form_submitted","generate_lead"]).
// Легаси-ключи (cta_click, nav_click, phone_click и т. д.) сохранены как fallback-ключи
// со старым дефолтным именем — GTM-триггеры заказчика продолжают работать без изменений.

export type AnalyticsRegistryEntry = {
  /** Канонический ключ точки взаимодействия — аргумент track(key) */
  key: string
  /** Название блока лендинга — UI-заголовок группы в админке (на украинском) */
  blockLabel: string
  /** Тип взаимодействия — UI-текст строки в админке (на украинском) */
  interactionLabel: string
  /**
   * Развёрнутое описание: ЧТО за элемент, ГДЕ он на сайте и КАКОЕ действие пользователя
   * запускает событие. Показывается в админке в подсказке (иконка «i» в строке).
   * На украинском — это UI-текст для заказчика.
   */
  description: string
  /**
   * Дефолтные имена событий (без конфига в БД). КРИТИЧНО: для разделённых ключей
   * дефолт = СТАРОЕ слитое имя — чтобы без конфига dataLayer оставался байт-в-байт
   * прежним (GTM-триггеры заказчика не ломаются).
   */
  defaultEventNames: readonly string[]
}

// ── Реестр точек взаимодействия (лендинг VRK Partners) ────────────────────────
// Порядок записей отображается в админке (группировка по blockLabel).
// Дефолтные имена — GA4-схема донора: cta_click / lead_form_submit /
// generate_lead... (form_start/form_submit НЕ используем — конфликт
// с GA4 Enhanced Measurement).
export const ANALYTICS_REGISTRY: readonly AnalyticsRegistryEntry[] = [
  // ── Шапка ─────────────────────────────────────────────────────────────────
  { key: 'header_cta_click',        blockLabel: 'Шапка',               interactionLabel: 'Клік по CTA-кнопці у шапці',              description: 'Користувач натиснув кнопку заявки у верхній шапці сайту (десктоп або мобільне меню).',                          defaultEventNames: ['cta_click'] },
  { key: 'header_phone_click',      blockLabel: 'Шапка',               interactionLabel: 'Клік по номеру телефону',                 description: 'Користувач натиснув на номер телефону у шапці сайту (десктоп або мобільне меню).',                              defaultEventNames: ['phone_click'] },

  // ── Первый экран (Hero) ───────────────────────────────────────────────────
  { key: 'hero_consult_cta_click',  blockLabel: 'Перший екран (Hero)', interactionLabel: 'Клік «Отримати консультацію»',            description: 'Користувач натиснув головну кнопку консультації на першому екрані.',                                            defaultEventNames: ['cta_click'] },
  { key: 'hero_audit_cta_click',    blockLabel: 'Перший екран (Hero)', interactionLabel: 'Клік «Безкоштовний аудит»',               description: 'Користувач натиснув кнопку аудиту реклами на першому екрані.',                                                  defaultEventNames: ['cta_click'] },

  // ── Услуги ────────────────────────────────────────────────────────────────
  { key: 'services_cta_click',      blockLabel: 'Послуги',             interactionLabel: 'Клік по CTA у блоці послуг',              description: 'Користувач натиснув кнопку заявки у блоці «Послуги».',                                                          defaultEventNames: ['cta_click'] },

  // ── Аудит ─────────────────────────────────────────────────────────────────
  { key: 'audit_request_click',     blockLabel: 'Аудит',               interactionLabel: 'Клік «Замовити аудит»',                   description: 'Користувач натиснув кнопку замовлення аудиту у блоці «Аудит».',                                                 defaultEventNames: ['cta_click'] },
  { key: 'audit_calc_click',        blockLabel: 'Аудит',               interactionLabel: 'Клік «Розрахувати бюджет»',               description: 'Користувач натиснув кнопку розрахунку бюджету у блоці «Аудит».',                                                defaultEventNames: ['cta_click'] },

  // ── Кейсы и доверие ───────────────────────────────────────────────────────
  { key: 'trust_cta_click',         blockLabel: 'Кейси і довіра',      interactionLabel: 'Клік по CTA у блоці кейсів',              description: 'Користувач натиснув кнопку заявки у блоці кейсів та цифр довіри.',                                              defaultEventNames: ['cta_click'] },
  { key: 'case_niche_click',        blockLabel: 'Кейси і довіра',      interactionLabel: 'Перемикання ніші кейсів',                 description: 'Користувач перемкнув вкладку ніші у слайдері кейсів (наприклад «E-commerce» чи «Послуги»).',                    defaultEventNames: ['case_niche'] },
  { key: 'case_open',               blockLabel: 'Кейси і довіра',      interactionLabel: 'Перегляд кейса',                          description: 'Користувач відкрив/перегорнув конкретний кейс у слайдері кейсів.',                                              defaultEventNames: ['case_open'] },
  { key: 'case_site_click',         blockLabel: 'Кейси і довіра',      interactionLabel: 'Клік по сайту клієнта в кейсі',           description: 'Користувач натиснув посилання на сайт клієнта у картці кейса.',                                                 defaultEventNames: ['case_site_click'] },

  // ── Партнёры ──────────────────────────────────────────────────────────────
  { key: 'partner_click',           blockLabel: 'Партнери',            interactionLabel: 'Клік по логотипу партнера',               description: 'Користувач натиснув на логотип у стрічці партнерів.',                                                           defaultEventNames: ['partner_click'] },

  // ── Процесс (бонус Google Ads) ────────────────────────────────────────────
  { key: 'google_bonus_cta_click',  blockLabel: 'Процес',              interactionLabel: 'Клік по CTA бонуса Google Ads',           description: 'Користувач натиснув кнопку отримання бонуса Google Ads у блоці «Процес».',                                      defaultEventNames: ['cta_click'] },

  // ── FAQ ───────────────────────────────────────────────────────────────────
  { key: 'faq_open',                blockLabel: 'FAQ',                 interactionLabel: 'Відкриття питання FAQ',                   description: 'Користувач розгорнув відповідь на питання у блоці поширених запитань (FAQ).',                                   defaultEventNames: ['faq_open'] },

  // ── Финальный CTA / Контакты ──────────────────────────────────────────────
  { key: 'final_cta_click',         blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по CTA у фінальному блоці',          description: 'Користувач натиснув кнопку заявки у фінальному блоці внизу сторінки.',                                          defaultEventNames: ['cta_click'] },
  { key: 'contacts_telegram_click', blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по посиланню на Telegram',           description: 'Користувач натиснув посилання Telegram у блоці контактів (фінальний CTA або футер).',                           defaultEventNames: ['telegram_click'] },
  { key: 'contacts_phone_click',    blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по номеру телефону в контактах',     description: 'Користувач натиснув номер телефону у блоці контактів (фінальний CTA або футер).',                              defaultEventNames: ['phone_click'] },
  { key: 'contacts_email_click',    blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по email в контактах',               description: 'Користувач натиснув email у блоці контактів (фінальний CTA або футер).',                                        defaultEventNames: ['email_click'] },

  // ── Кнопка «Або напишіть нам» (Telegram) ──────────────────────────────────
  // Стоит рядом с CTA-кнопками по секциям. Одно событие с параметром placement
  // (hero / audit / services / trust / process / final / header).
  { key: 'telegram_cta_click',      blockLabel: 'Кнопка «Або напишіть нам»', interactionLabel: 'Клік по Telegram-кнопці біля CTA',        description: 'Користувач натиснув кнопку «Або напишіть нам» (прямий чат менеджера в Telegram), що стоїть поруч із CTA-кнопками по секціях. Параметр placement вказує секцію.', defaultEventNames: ['telegram_click'] },

  // ── Формы ─────────────────────────────────────────────────────────────────
  // Одна форма (LeadForm) рендерится в нескольких местах — параметр source
  // различает размещение (hero, audit, final, modal...).
  { key: 'form_open',               blockLabel: 'Форми',               interactionLabel: 'Відкриття модальної форми',               description: 'Користувач відкрив спливаюче вікно форми заявки (його відкривають CTA-кнопки по сайту).',                       defaultEventNames: ['lead_form_open'] },
  { key: 'form_submit_attempt',     blockLabel: 'Форми',               interactionLabel: 'Спроба відправки форми',                  description: 'Користувач натиснув кнопку відправлення форми (момент спроби, ще до відповіді сервера).',                       defaultEventNames: ['lead_form_submit'] },
  { key: 'form_submit_success',     blockLabel: 'Форми',               interactionLabel: 'Успішна відправка форми',                 description: 'Заявку успішно надіслано — ключова подія-конверсія.',                                                           defaultEventNames: ['generate_lead'] },
  { key: 'form_submit_error',       blockLabel: 'Форми',               interactionLabel: 'Помилка відправки форми',                 description: 'Сервер відхилив заявку або запит не дійшов до сервера — заявка не збережена.',                                  defaultEventNames: ['lead_form_error'] },
] as const

/**
 * Тип-объединение всех ключей реестра. Выводится из данных — единый источник правды.
 * Используется в декларативной привязке (`trackProps`) для проверки на этапе компиляции.
 */
export type AnalyticsKey = (typeof ANALYTICS_REGISTRY)[number]['key']

/** Множество валидных ключей — для быстрой проверки */
export const ANALYTICS_EVENT_KEYS: ReadonlySet<string> = new Set(
  ANALYTICS_REGISTRY.map((e) => e.key)
)

/** Map ключ → запись реестра — для UI/валидации */
export const ANALYTICS_REGISTRY_MAP: ReadonlyMap<string, AnalyticsRegistryEntry> = new Map(
  ANALYTICS_REGISTRY.map((e) => [e.key, e])
)

/** Формат имени события (серверный инвариант) */
export const ANALYTICS_EVENT_NAME_PATTERN = /^[a-z0-9_]{1,40}$/

/** Максимум имён событий на одну точку взаимодействия */
export const MAX_EVENT_NAMES_PER_KEY = 5

/** Запрещённые имена (раздел 15): совпадают с автособытиями GA4 Enhanced Measurement. */
export const RESERVED_EVENT_NAMES: ReadonlySet<string> = new Set(['form_start', 'form_submit'])

export function isValidEventName(value: unknown): value is string {
  return typeof value === 'string' && ANALYTICS_EVENT_NAME_PATTERN.test(value)
}

// ── Конфиг (settings-ключ `analytics_events` в site_settings) ────────────────

export type AnalyticsEventConfig = {
  enabled: boolean
  /**
   * Массив имён событий — одна точка может генерировать несколько событий (промпт 018).
   * Если отсутствует (легаси-запись) — lib использует [eventName] как резерв.
   */
  eventNames?: string[]
  /**
   * Легаси-поле: первое или единственное имя события (промпт 016).
   * Lib продолжает заполнять его для обратной совместимости.
   */
  eventName?: string
}

/** Частичный map: ключ реестра → настройка. Отсутствующий ключ = дефолт. */
export type AnalyticsEventsConfig = Record<string, AnalyticsEventConfig>

/**
 * Дефолт: всё включено.
 * eventNames = defaultEventNames из реестра (новый API промпта 018).
 * eventName = первое имя из defaultEventNames (легаси-совместимость).
 */
export function getDefaultAnalyticsEvents(): AnalyticsEventsConfig {
  const map: AnalyticsEventsConfig = {}
  for (const entry of ANALYTICS_REGISTRY) {
    const defaultNames = [...entry.defaultEventNames]
    map[entry.key] = {
      enabled: true,
      eventNames: defaultNames,
      eventName: defaultNames[0] ?? entry.key,
    }
  }
  return map
}

/**
 * Санитизация сырого конфига (из БД или инлайна).
 * Пропускает ТОЛЬКО известные ключи реестра с валидными значениями.
 * Поддерживает ЛЕГАСИ-формат { eventName: string } — конвертирует в { eventNames: [eventName] }.
 * Значения попадают в inline-скрипт лендинга → это и защита от XSS, и мягкая деградация.
 */
export function parseAnalyticsEventsConfig(raw: unknown): AnalyticsEventsConfig {
  const result: AnalyticsEventsConfig = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return result

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ANALYTICS_EVENT_KEYS.has(key)) continue
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue

    const entry = value as Record<string, unknown>
    const enabled = entry.enabled !== false // всё, кроме явного false, = true

    let eventNames: string[]

    if (Array.isArray(entry.eventNames)) {
      // Новый формат: массив имён — фильтруем невалидные, обрезаем до MAX, схлопываем дубликаты
      const filtered = (entry.eventNames as unknown[])
        .filter(isValidEventName)
        .slice(0, MAX_EVENT_NAMES_PER_KEY)
      eventNames = [...new Set(filtered)]
    } else if (typeof entry.eventName === 'string') {
      // Легаси-формат { eventName: 'x' } → конвертируем
      eventNames = isValidEventName(entry.eventName) ? [entry.eventName] : []
    } else {
      // Нет ни eventNames, ни eventName — пустой список (точка молчит)
      eventNames = []
    }

    // Сохраняем eventName (первое имя или ключ) для совместимости
    const legacyName = eventNames[0] ?? key
    result[key] = { enabled, eventNames, eventName: legacyName }
  }
  return result
}

/**
 * Резолвер для track(key): определяет, отправлять ли событие и под какими именами.
 * Нет конфига / нет ключа в конфиге → дефолт (enabled, eventNames = defaultEventNames из реестра).
 * Ключ отсутствует и в реестре → { enabled: true, eventNames: [key] }.
 * Defense-in-depth: невалидные имена в runtime-мапе отбрасываются.
 */
export function resolveAnalyticsEvent(
  key: string,
  config?: AnalyticsEventsConfig | null
): { enabled: boolean; eventNames: string[] } {
  const registryEntry = ANALYTICS_REGISTRY_MAP.get(key)
  const configEntry = config?.[key]

  if (!configEntry) {
    // Нет конфига — возвращаем дефолты из реестра (или [key], если ключ неизвестен)
    const defaultNames = registryEntry ? [...registryEntry.defaultEventNames] : [key]
    return { enabled: true, eventNames: defaultNames }
  }

  // Если eventNames отсутствует (легаси-запись только с eventName) — fallback на [eventName]
  const rawNames: string[] = configEntry.eventNames !== undefined
    ? configEntry.eventNames
    : (isValidEventName(configEntry.eventName) ? [configEntry.eventName] : [])

  // Defense-in-depth: фильтруем невалидные имена даже из уже проверенного конфига
  const sanitized = rawNames.filter(isValidEventName)

  return {
    enabled: configEntry.enabled !== false,
    eventNames: sanitized,
  }
}

/** Ключ в таблице site_settings для конфига событий */
export const ANALYTICS_EVENTS_SETTING_KEY = 'analytics_events'
