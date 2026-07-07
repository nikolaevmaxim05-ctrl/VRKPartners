// analytics-registry.ts — канонічний реєстр точок взаємодії аналітики (промпти 016, 018).
// Використовується:
//   • лендингом (lib/analytics.ts) — резолвінг імен подій та enabled/disabled;
//   • (marketing)/layout.tsx — серверне читання конфігу + інлайн window.__analyticsEvents;
//   • admin API (/api/admin/analytics-events) — серверна валідація;
//   • адмінкою (секція «Події аналітики») — лейбли блоків/взаємодій.
//
// Ключі реєстру = поточні імена в коді (track("...")). Це навмисно:
// без конфігу в БД поведінка на 100% поточна, GTM-тригери замовника не ламаються.
//
// Промпт 018: кожна точка тепер підтримує МАСИВ імен подій (defaultEventNames),
// щоб один track()-виклик міг генерувати кілька подій (наприклад, ["form_submitted","generate_lead"]).
// Легасі-ключі (cta_click, nav_click, phone_click тощо) збережені як fallback-ключі
// зі старим дефолтним іменем — GTM-тригери замовника продовжують працювати без змін.

export type AnalyticsRegistryEntry = {
  /** Канонічний ключ точки взаємодії — аргумент track(key) */
  key: string
  /** Назва блоку лендингу — UI-заголовок групи в адмінці (українською) */
  blockLabel: string
  /** Тип взаємодії — UI-текст рядка в адмінці (українською) */
  interactionLabel: string
  /**
   * Розгорнутий опис: ЩО за елемент, ДЕ він на сайті та ЯКА дія користувача
   * запускає подію. Показується в адмінці у підказці (іконка «i» в рядку).
   * Українською — це UI-текст для замовника.
   */
  description: string
  /**
   * Дефолтні імена подій (без конфігу в БД). КРИТИЧНО: для розщеплених ключів
   * дефолт = СТАРЕ слите ім'я — щоб без конфігу dataLayer залишався байт-в-байт
   * попереднім (GTM-тригери замовника не ламаються).
   */
  defaultEventNames: readonly string[]
}

// ── Реєстр точок взаємодії (лендінг VRK Partners) ─────────────────────────────
// Порядок записів відображається в адмінці (групування по blockLabel).
// Дефолтні імена — GA4-схема донора: cta_click / lead_form_submit /
// generate_lead... (form_start/form_submit НЕ використовуємо — конфлікт
// з GA4 Enhanced Measurement).
export const ANALYTICS_REGISTRY: readonly AnalyticsRegistryEntry[] = [
  // ── Шапка ─────────────────────────────────────────────────────────────────
  { key: 'header_cta_click',        blockLabel: 'Шапка',               interactionLabel: 'Клік по CTA-кнопці у шапці',              description: 'Користувач натиснув кнопку заявки у верхній шапці сайту (десктоп або мобільне меню).',                          defaultEventNames: ['cta_click'] },
  { key: 'header_phone_click',      blockLabel: 'Шапка',               interactionLabel: 'Клік по номеру телефону',                 description: 'Користувач натиснув на номер телефону у шапці сайту (десктоп або мобільне меню).',                              defaultEventNames: ['phone_click'] },

  // ── Перший екран (Hero) ───────────────────────────────────────────────────
  { key: 'hero_consult_cta_click',  blockLabel: 'Перший екран (Hero)', interactionLabel: 'Клік «Отримати консультацію»',            description: 'Користувач натиснув головну кнопку консультації на першому екрані.',                                            defaultEventNames: ['cta_click'] },
  { key: 'hero_audit_cta_click',    blockLabel: 'Перший екран (Hero)', interactionLabel: 'Клік «Безкоштовний аудит»',               description: 'Користувач натиснув кнопку аудиту реклами на першому екрані.',                                                  defaultEventNames: ['cta_click'] },

  // ── Послуги ───────────────────────────────────────────────────────────────
  { key: 'services_cta_click',      blockLabel: 'Послуги',             interactionLabel: 'Клік по CTA у блоці послуг',              description: 'Користувач натиснув кнопку заявки у блоці «Послуги».',                                                          defaultEventNames: ['cta_click'] },

  // ── Аудит ─────────────────────────────────────────────────────────────────
  { key: 'audit_request_click',     blockLabel: 'Аудит',               interactionLabel: 'Клік «Замовити аудит»',                   description: 'Користувач натиснув кнопку замовлення аудиту у блоці «Аудит».',                                                 defaultEventNames: ['cta_click'] },
  { key: 'audit_calc_click',        blockLabel: 'Аудит',               interactionLabel: 'Клік «Розрахувати бюджет»',               description: 'Користувач натиснув кнопку розрахунку бюджету у блоці «Аудит».',                                                defaultEventNames: ['cta_click'] },

  // ── Кейси і довіра ────────────────────────────────────────────────────────
  { key: 'trust_cta_click',         blockLabel: 'Кейси і довіра',      interactionLabel: 'Клік по CTA у блоці кейсів',              description: 'Користувач натиснув кнопку заявки у блоці кейсів та цифр довіри.',                                              defaultEventNames: ['cta_click'] },
  { key: 'case_niche_click',        blockLabel: 'Кейси і довіра',      interactionLabel: 'Перемикання ніші кейсів',                 description: 'Користувач перемкнув вкладку ніші у слайдері кейсів (наприклад «E-commerce» чи «Послуги»).',                    defaultEventNames: ['case_niche'] },
  { key: 'case_open',               blockLabel: 'Кейси і довіра',      interactionLabel: 'Перегляд кейса',                          description: 'Користувач відкрив/перегорнув конкретний кейс у слайдері кейсів.',                                              defaultEventNames: ['case_open'] },
  { key: 'case_site_click',         blockLabel: 'Кейси і довіра',      interactionLabel: 'Клік по сайту клієнта в кейсі',           description: 'Користувач натиснув посилання на сайт клієнта у картці кейса.',                                                 defaultEventNames: ['case_site_click'] },

  // ── Партнери ──────────────────────────────────────────────────────────────
  { key: 'partner_click',           blockLabel: 'Партнери',            interactionLabel: 'Клік по логотипу партнера',               description: 'Користувач натиснув на логотип у стрічці партнерів.',                                                           defaultEventNames: ['partner_click'] },

  // ── Процес (бонус Google Ads) ─────────────────────────────────────────────
  { key: 'google_bonus_cta_click',  blockLabel: 'Процес',              interactionLabel: 'Клік по CTA бонуса Google Ads',           description: 'Користувач натиснув кнопку отримання бонуса Google Ads у блоці «Процес».',                                      defaultEventNames: ['cta_click'] },

  // ── FAQ ───────────────────────────────────────────────────────────────────
  { key: 'faq_open',                blockLabel: 'FAQ',                 interactionLabel: 'Відкриття питання FAQ',                   description: 'Користувач розгорнув відповідь на питання у блоці поширених запитань (FAQ).',                                   defaultEventNames: ['faq_open'] },

  // ── Фінальний CTA / Контакти ──────────────────────────────────────────────
  { key: 'final_cta_click',         blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по CTA у фінальному блоці',          description: 'Користувач натиснув кнопку заявки у фінальному блоці внизу сторінки.',                                          defaultEventNames: ['cta_click'] },
  { key: 'contacts_telegram_click', blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по посиланню на Telegram',           description: 'Користувач натиснув посилання Telegram у блоці контактів (фінальний CTA або футер).',                           defaultEventNames: ['telegram_click'] },
  { key: 'contacts_phone_click',    blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по номеру телефону в контактах',     description: 'Користувач натиснув номер телефону у блоці контактів (фінальний CTA або футер).',                              defaultEventNames: ['phone_click'] },
  { key: 'contacts_email_click',    blockLabel: 'Фінальний CTA',       interactionLabel: 'Клік по email в контактах',               description: 'Користувач натиснув email у блоці контактів (фінальний CTA або футер).',                                        defaultEventNames: ['email_click'] },

  // ── Форми ─────────────────────────────────────────────────────────────────
  // Одна форма (LeadForm) рендериться у кількох місцях — параметр source
  // розрізняє розміщення (hero, audit, final, modal...).
  { key: 'form_open',               blockLabel: 'Форми',               interactionLabel: 'Відкриття модальної форми',               description: 'Користувач відкрив спливаюче вікно форми заявки (його відкривають CTA-кнопки по сайту).',                       defaultEventNames: ['lead_form_open'] },
  { key: 'form_submit_attempt',     blockLabel: 'Форми',               interactionLabel: 'Спроба відправки форми',                  description: 'Користувач натиснув кнопку відправлення форми (момент спроби, ще до відповіді сервера).',                       defaultEventNames: ['lead_form_submit'] },
  { key: 'form_submit_success',     blockLabel: 'Форми',               interactionLabel: 'Успішна відправка форми',                 description: 'Заявку успішно надіслано — ключова подія-конверсія.',                                                           defaultEventNames: ['generate_lead'] },
  { key: 'form_submit_error',       blockLabel: 'Форми',               interactionLabel: 'Помилка відправки форми',                 description: 'Сервер відхилив заявку або запит не дійшов до сервера — заявка не збережена.',                                  defaultEventNames: ['lead_form_error'] },
] as const

/**
 * Тип-обʼєднання всіх ключів реєстру. Виводиться з даних — єдине джерело правди.
 * Використовується в декларативній привязці (`trackProps`) для перевірки на компіляції.
 */
export type AnalyticsKey = (typeof ANALYTICS_REGISTRY)[number]['key']

/** Множина валідних ключів — для швидкої перевірки */
export const ANALYTICS_EVENT_KEYS: ReadonlySet<string> = new Set(
  ANALYTICS_REGISTRY.map((e) => e.key)
)

/** Map ключ → запис реєстру — для UI/валідації */
export const ANALYTICS_REGISTRY_MAP: ReadonlyMap<string, AnalyticsRegistryEntry> = new Map(
  ANALYTICS_REGISTRY.map((e) => [e.key, e])
)

/** Формат імені події (серверний інваріант) */
export const ANALYTICS_EVENT_NAME_PATTERN = /^[a-z0-9_]{1,40}$/

/** Максимум імен подій на одну точку взаємодії */
export const MAX_EVENT_NAMES_PER_KEY = 5

export function isValidEventName(value: unknown): value is string {
  return typeof value === 'string' && ANALYTICS_EVENT_NAME_PATTERN.test(value)
}

// ── Конфіг (settings-ключ `analytics_events` у site_settings) ────────────────

export type AnalyticsEventConfig = {
  enabled: boolean
  /**
   * Масив імен подій — одна точка може генерувати декілька подій (промпт 018).
   * Якщо відсутній (легасі-запис) — lib використовує [eventName] як резерв.
   */
  eventNames?: string[]
  /**
   * Легасі-поле: перше або єдине ім'я події (промпт 016).
   * Lib продовжує заповнювати його для зворотної сумісності.
   */
  eventName?: string
}

/** Частковий map: ключ реєстру → налаштування. Відсутній ключ = дефолт. */
export type AnalyticsEventsConfig = Record<string, AnalyticsEventConfig>

/**
 * Дефолт: усе ввімкнено.
 * eventNames = defaultEventNames з реєстру (новий API промпту 018).
 * eventName = перше ім'я з defaultEventNames (легасі-сумісність).
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
 * Санітизація сирого конфігу (з БД або інлайну).
 * Пропускає ТІЛЬКИ відомі ключі реєстру з валідними значеннями.
 * Підтримує ЛЕГАСІ-формат { eventName: string } — конвертує в { eventNames: [eventName] }.
 * Значення потрапляють в inline-скрипт лендингу → це і захист від XSS, і м'яка деградація.
 */
export function parseAnalyticsEventsConfig(raw: unknown): AnalyticsEventsConfig {
  const result: AnalyticsEventsConfig = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return result

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ANALYTICS_EVENT_KEYS.has(key)) continue
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue

    const entry = value as Record<string, unknown>
    const enabled = entry.enabled !== false // усе, крім явного false, = true

    let eventNames: string[]

    if (Array.isArray(entry.eventNames)) {
      // Новий формат: масив імен — фільтруємо невалідні, обрізаємо до MAX, схлопуємо дублікати
      const filtered = (entry.eventNames as unknown[])
        .filter(isValidEventName)
        .slice(0, MAX_EVENT_NAMES_PER_KEY)
      eventNames = [...new Set(filtered)]
    } else if (typeof entry.eventName === 'string') {
      // Легасі-формат { eventName: 'x' } → конвертуємо
      eventNames = isValidEventName(entry.eventName) ? [entry.eventName] : []
    } else {
      // Немає ні eventNames, ні eventName — пустий список (точка мовчить)
      eventNames = []
    }

    // Зберігаємо eventName (перше ім'я або ключ) для сумісності
    const legacyName = eventNames[0] ?? key
    result[key] = { enabled, eventNames, eventName: legacyName }
  }
  return result
}

/**
 * Резолвер для track(key): визначає, чи відправляти подію і під якими іменами.
 * Немає конфігу / немає ключа в конфігу → дефолт (enabled, eventNames = defaultEventNames з реєстру).
 * Ключ відсутній і в реєстрі → { enabled: true, eventNames: [key] }.
 * Defense-in-depth: невалідні імена в runtime-мапі відкидаються.
 */
export function resolveAnalyticsEvent(
  key: string,
  config?: AnalyticsEventsConfig | null
): { enabled: boolean; eventNames: string[] } {
  const registryEntry = ANALYTICS_REGISTRY_MAP.get(key)
  const configEntry = config?.[key]

  if (!configEntry) {
    // Немає конфігу — повертаємо дефолти з реєстру (або [key] якщо ключ невідомий)
    const defaultNames = registryEntry ? [...registryEntry.defaultEventNames] : [key]
    return { enabled: true, eventNames: defaultNames }
  }

  // Якщо eventNames відсутній (легасі-запис лише з eventName) — fallback на [eventName]
  const rawNames: string[] = configEntry.eventNames !== undefined
    ? configEntry.eventNames
    : (isValidEventName(configEntry.eventName) ? [configEntry.eventName] : [])

  // Defense-in-depth: фільтруємо невалідні імена навіть із вже-перевіреного конфігу
  const sanitized = rawNames.filter(isValidEventName)

  return {
    enabled: configEntry.enabled !== false,
    eventNames: sanitized,
  }
}

/** Ключ у таблиці site_settings для конфігу подій */
export const ANALYTICS_EVENTS_SETTING_KEY = 'analytics_events'
