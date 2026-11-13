// core/domain/content/layout — раскладка редактора контента (раздел 9 «Раскладка редактора»).
//
// Вкладка = страница сайта; внутри — блоки в порядке появления на сайте, с номером, как на сайте.
// Технических разделов текстов клиент не видит. Контракт-тесты (shared/content/__tests__):
//   • каждый редактируемый ключ показан ровно один раз (дубль — только в блоке с `shared`);
//   • множества вкладок CONTENT_PAGES и ключей PAGE_BLOCKS совпадают;
//   • id блоков совпадают с HIDEABLE_BLOCKS в обе стороны (для страниц с `ns`).
//
// Добавить текст → ключ в messages/uk.json + в блок PAGE_BLOCKS + подпись в KEY_LABELS.
// Добавить блок → строка в PAGE_BLOCKS на своём месте (если скрываемый — сначала HIDEABLE_BLOCKS).

export type ContentPage = {
  id: string
  label: string
  /** Где эти тексты на сайте. */
  hint: string
  /** Раздел со списком скрытого; нет — скрывать нечего. */
  ns?: string
  tabs?: ContentPage[]
}

export const CONTENT_PAGES: ContentPage[] = [
  { id: 'home', label: 'Головна', hint: 'Усі блоки головної сторінки зверху донизу', ns: 'home' },
  { id: 'global', label: 'Наскрізне', hint: 'Контакти, шапка й меню, футер, форма заявки, службові сторінки' },
]

export type PagePart = {
  ns: string
  /** Ключи раздела; пустой список = весь раздел (для разделов-массивов, напр. faq). */
  keys: string[]
}

export type PageBlock = {
  /** Совпадает с id в HIDEABLE_BLOCKS (для скрываемых страниц). */
  id: string
  title: string
  parts: PagePart[]
  /** На каких ещё вкладках этот блок выводится (тексты общие, скрытие — своё). */
  shared?: string[]
  /** Служебный блок без номера, внизу. */
  aux?: boolean
}

export const PAGE_BLOCKS: Record<string, PageBlock[]> = {
  home: [
    {
      id: 'hero',
      title: 'Перший екран',
      parts: [
        {
          ns: 'hero',
          keys: [
            'title', 'subtitle', 'trust', 'trustHref', 'primaryCta', 'secondaryCta', 'formNote', 'submitLabel',
            'auditModalTitle', 'auditModalDescription', 'auditSubmitLabel', 'partnersTitle', 'partners',
            'partnerBadge', 'partnerBadgeAlt', 'partnerTitle', 'partnerLinkText',
          ],
        },
      ],
    },
    { id: 'usp', title: 'Переваги', parts: [{ ns: 'usp', keys: ['eyebrow', 'title', 'text', 'items'] }] },
    {
      id: 'about',
      title: 'Про нас (команда)',
      parts: [{ ns: 'about', keys: ['eyebrow', 'title', 'text', 'experienceLabel', 'roleLabel', 'skillsLabel', 'members'] }],
    },
    {
      id: 'services',
      title: 'Послуги',
      parts: [{ ns: 'services', keys: ['title', 'text', 'items', 'showMore', 'showLess', 'zoomLabel', 'cta', 'submitLabel', 'popup'] }],
    },
    {
      id: 'audit',
      title: 'Аудит',
      parts: [{ ns: 'audit', keys: ['title', 'items', 'cta', 'auditModalDescription', 'ctaSecondary', 'calcModalDescription'] }],
    },
    {
      id: 'cases',
      title: 'Кейси',
      parts: [
        {
          ns: 'trust',
          keys: [
            'title', 'facts', 'partnerLabel', 'highlights', 'ctaSecondary', 'modalTitle',
            'modalDescription', 'submitLabel', 'casesTitle', 'caseHint', 'nicheStep', 'nichesAria', 'caseStep', 'casesAria',
            'taskLabel', 'imageAlt', 'approachTitle', 'caseGroups',
          ],
        },
      ],
    },
    { id: 'benefits', title: 'Що ви отримуєте', parts: [{ ns: 'benefits', keys: ['title', 'instead', 'items'] }] },
    { id: 'process', title: 'Процес', parts: [{ ns: 'workflow', keys: ['title', 'steps', 'prevAria', 'nextAria', 'bonus'] }] },
    { id: 'faq', title: 'FAQ', parts: [{ ns: 'faq', keys: [] }] },
    {
      id: 'finalCta',
      title: 'Фінальний блок (CTA та контакти)',
      parts: [
        {
          ns: 'finalCta',
          keys: ['title', 'text', 'primaryCta', 'modalDescription', 'submitLabel', 'telegramLabel', 'emailLabel', 'phoneLabel'],
        },
      ],
    },
  ],
  global: [
    {
      id: 'site',
      title: 'Назва та контакти',
      parts: [
        {
          ns: 'site',
          keys: ['name', 'description', 'phone', 'phoneHref', 'email', 'telegram', 'telegramHandle', 'telegramCtaText', 'telegramCtaUrl'],
        },
      ],
    },
    { id: 'nav', title: 'Меню', parts: [{ ns: 'nav', keys: ['usp', 'about', 'services', 'audit', 'cases', 'benefits', 'process', 'faq'] }] },
    {
      id: 'header',
      title: 'Шапка',
      parts: [
        {
          ns: 'header',
          keys: ['consultShort', 'consultCta', 'modalTitle', 'modalDescription', 'logoAria', 'navAria', 'mobileNavAria', 'menuOpen', 'menuClose'],
        },
      ],
    },
    {
      id: 'footer',
      title: 'Футер',
      parts: [
        {
          ns: 'footer',
          keys: ['description', 'approachTitle', 'approach', 'navTitle', 'navAria', 'contactsTitle', 'legalNavAria', 'privacy', 'offer', 'rights', 'tagline'],
        },
      ],
    },
    {
      id: 'form',
      title: 'Форма заявки',
      parts: [
        {
          ns: 'form',
          keys: [
            'nameLabel', 'namePlaceholder', 'phoneLabel', 'phonePlaceholder', 'submit', 'consentPrefix', 'consentLinkText',
            'doneTitle', 'doneText', 'errorRateLimited', 'errorUnavailable', 'errorFailed', 'errorNetwork', 'honeypotLabel', 'closeLabel',
            'errorNameMin', 'errorNameMax', 'errorNameLetters', 'errorPhoneRequired', 'errorPhoneIncomplete', 'errorEmailInvalid',
          ],
        },
      ],
    },
    { id: 'thanks', title: 'Сторінка «Дякуємо»', parts: [{ ns: 'thanks', keys: ['metaTitle', 'title', 'text', 'home'] }] },
    { id: 'notFound', title: 'Сторінка 404', parts: [{ ns: 'notFound', keys: ['title', 'text', 'home'] }] },
    { id: 'legal', title: 'Юридичні сторінки (обгортка)', parts: [{ ns: 'legal', keys: ['backHome', 'updatedAt'] }], aux: true },
  ],
}

/**
 * Человеческие подписи полей. Поиск: полный путь `ns.key` → имя ключа. Имена элементов массивов —
 * по имени ключа (`name`, `desc`…), поэтому одна запись покрывает все списки.
 */
export const KEY_LABELS: Record<string, string> = {
  // общие имена
  title: 'Заголовок',
  subtitle: 'Підзаголовок',
  text: 'Текст',
  desc: 'Опис',
  eyebrow: 'Надзаголовок',
  cta: 'Кнопка',
  ctaSecondary: 'Друга кнопка',
  primaryCta: 'Кнопка',
  secondaryCta: 'Друга кнопка',
  submitLabel: 'Кнопка відправки у формі',
  modalTitle: 'Заголовок модалки',
  modalDescription: 'Підпис у модалці заявки',
  items: 'Пункти',
  instead: 'Підпис «замість»',
  name: 'Назва',
  icon: 'Іконка',
  points: 'Пункти списку',
  label: 'Підпис',
  value: 'Значення',
  highlight: 'Фрагмент для підсвітки',
  home: 'Кнопка «На головну»',
  // site
  'site.name': 'Назва компанії',
  'site.description': 'Опис компанії (метадані та маніфест)',
  phone: 'Телефон (відображення)',
  phoneHref: 'Телефон (посилання tel:)',
  email: 'Email',
  telegram: 'Telegram (посилання)',
  telegramHandle: 'Telegram (нік)',
  telegramCtaText: 'Кнопка «Або напишіть нам» — текст',
  telegramCtaUrl: 'Кнопка «Або напишіть нам» — посилання (лише t.me)',
  // nav
  'nav.usp': 'Пункт «Переваги»',
  'nav.about': 'Пункт «Про нас»',
  'nav.services': 'Пункт «Послуги»',
  'nav.audit': 'Пункт «Аудит»',
  'nav.cases': 'Пункт «Кейси»',
  'nav.benefits': 'Пункт «Що отримуєте»',
  'nav.process': 'Пункт «Процес»',
  'nav.faq': 'Пункт «FAQ»',
  // header
  consultShort: 'Кнопка в шапці (десктоп)',
  consultCta: 'Кнопка в шапці (мобільне меню)',
  logoAria: 'Логотип — підпис для читачів екрана',
  navAria: 'Навігація — підпис для читачів екрана',
  mobileNavAria: 'Мобільна навігація — підпис для читачів екрана',
  menuOpen: 'Кнопка «Відкрити меню» — підпис',
  menuClose: 'Кнопка «Закрити меню» — підпис',
  // hero
  'hero.trust': 'Рядок довіри',
  trustHref: 'Посилання рядка довіри (URL)',
  formNote: 'Підпис у модалці заявки',
  auditModalTitle: 'Модалка аудиту — заголовок',
  auditModalDescription: 'Модалка аудиту — підпис',
  auditSubmitLabel: 'Модалка аудиту — кнопка',
  partnersTitle: 'Підпис над логотипами партнерів',
  partners: 'Партнери (логотипи)',
  logo: 'Логотип',
  href: 'Посилання',
  'hero.partnerBadge': 'Бейдж Google Partner (зображення)',
  partnerBadgeAlt: 'Бейдж — альтернативний текст',
  partnerTitle: 'Текст блоку Google Partner',
  partnerLinkText: 'Текст посилання на каталог партнерів',
  // about
  experienceLabel: 'Підпис «Досвід»',
  roleLabel: 'Підпис «Роль»',
  skillsLabel: 'Підпис «Навички»',
  members: 'Учасники команди',
  photo: 'Фото',
  experience: 'Досвід',
  role: 'Роль',
  skills: 'Навички',
  // services
  showMore: 'Кнопка «Показати більше»',
  showLess: 'Кнопка «Згорнути»',
  zoomLabel: 'Кнопка «Збільшити зображення» (тач) — підпис',
  popup: 'Модалка консультації',
  note: 'Підпис',
  mockup: 'Мініатюра (зображення)',
  mockupFull: 'Велике превʼю (зображення)',
  mockupAlt: 'Альтернативний текст мініатюри',
  previewWide: 'Широке превʼю',
  // audit
  calcModalDescription: 'Модалка прорахунку — підпис',
  // trust / cases
  facts: 'Факти',
  partnerLabel: 'Бейдж «Google Partner»',
  highlights: 'Ключові цифри',
  casesTitle: 'Заголовок картки кейсів',
  caseHint: 'Підказка під заголовком кейсів',
  nicheStep: 'Крок 1 — підпис',
  nichesAria: 'Крок 1 — підпис для читачів екрана',
  caseStep: 'Крок 2 — підпис',
  casesAria: 'Крок 2 — підпис для читачів екрана',
  taskLabel: 'Підпис «Завдання»',
  imageAlt: 'Скрін результатів — альтернативний текст',
  approachTitle: 'Підпис «Підходи до результату»',
  caseGroups: 'Ніші з кейсами',
  niche: 'Ніша',
  cases: 'Кейси',
  client: 'Клієнт (сайт)',
  task: 'Завдання',
  image: 'Скрін результатів (зображення)',
  metrics: 'Метрики',
  approach: 'Підходи',
  // workflow
  steps: 'Кроки',
  prevAria: 'Кнопка «Попередні кроки» — підпис',
  nextAria: 'Кнопка «Наступні кроки» — підпис',
  bonus: 'Бонус від Google',
  badge: 'Бейдж',
  terms: 'Умови',
  // finalCta
  telegramLabel: 'Підпис контакту Telegram',
  emailLabel: 'Підпис контакту Email',
  phoneLabel: 'Підпис контакту Телефон',
  // faq
  faq: 'Питання та відповіді',
  q: 'Питання',
  a: 'Відповідь',
  // footer
  'footer.description': 'Опис у футері',
  'footer.approachTitle': 'Підпис «Наш підхід»',
  'footer.approach': 'Наш підхід (пункти)',
  navTitle: 'Підпис «Навігація»',
  contactsTitle: 'Підпис «Контакти»',
  legalNavAria: 'Правова навігація — підпис для читачів екрана',
  privacy: 'Посилання «Політика конфіденційності»',
  offer: 'Посилання «Публічна оферта»',
  rights: 'Рядок копірайту',
  tagline: 'Рядок під копірайтом',
  // form
  nameLabel: 'Поле «Імʼя» — підпис',
  namePlaceholder: 'Поле «Імʼя» — плейсхолдер',
  'form.phoneLabel': 'Поле «Телефон» — підпис',
  phonePlaceholder: 'Поле «Телефон» — плейсхолдер',
  honeypotLabel: 'Приховане поле-пастка — підпис',
  submit: 'Кнопка відправки (за замовчуванням)',
  consentPrefix: 'Текст згоди (до посилання)',
  consentLinkText: 'Текст посилання на політику',
  errorRateLimited: 'Помилка: забагато спроб',
  errorUnavailable: 'Помилка: технічна недоступність',
  errorFailed: 'Помилка: не вдалося надіслати',
  errorNetwork: 'Помилка: мережа',
  doneTitle: 'Успіх — заголовок',
  doneText: 'Успіх — текст',
  closeLabel: 'Кнопка «Закрити» модалки — підпис',
  errorNameMin: 'Помилка поля «Імʼя»: коротке',
  errorNameMax: 'Помилка поля «Імʼя»: довге',
  errorNameLetters: 'Помилка поля «Імʼя»: недопустимі символи',
  errorPhoneRequired: 'Помилка поля «Телефон»: порожнє',
  errorPhoneIncomplete: 'Помилка поля «Телефон»: неповний номер',
  errorEmailInvalid: 'Помилка поля «Email»: некоректний',
  // thanks / notFound / legal
  metaTitle: 'Заголовок вкладки браузера',
  backHome: 'Посилання «На головну»',
  updatedAt: 'Підпис «Останнє оновлення»',
}

/** Подпись поля: полный путь `ns.key` → имя ключа → само имя. */
export function keyLabel(ns: string, key: string): string {
  return KEY_LABELS[`${ns}.${key}`] ?? KEY_LABELS[key] ?? key
}
