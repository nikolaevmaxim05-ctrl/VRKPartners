/**
 * Єдине джерело правди для контенту лендингу VRK Partners.
 * ВСІ рядки, які бачить користувач — українською (uk-UA).
 * Винесено сюди для A/B-тестів і редагування без правок у компонентах.
 */

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://vrkpartners.com";

export const site = {
  name: "VRK Partners",
  legalName: "VRK Partners",
  tagline: "Google Ads та performance-маркетинг для бізнесу",
  description:
    "VRK Partners — офіційний Google Partner. Допомагаємо eCommerce, B2B, медичним проєктам, онлайн-школам, SaaS та локальному бізнесу отримувати стабільні ліди, продажі та прозорий ROI реклами.",
  email: "hello@vrkpartners.com",
  phone: "+38 (097) 000-00-00",
  phoneHref: "tel:+380970000000",
  telegram: "https://t.me/vrkpartners",
  telegramHandle: "@vrkpartners",
  format: "Онлайн",
} as const;

export const nav = [
  { label: "Про нас", href: "#about" },
  { label: "Послуги", href: "#services" },
  { label: "Аудит", href: "#audit" },
  { label: "Кейси", href: "#cases" },
  { label: "Процес", href: "#process" },
  { label: "FAQ", href: "#faq" },
] as const;

/** Партнери / інтеграції (компактний рядок довіри) */
export const partners = [
  {
    name: "Ringostat",
    logo: "/partners/ringostat.png",
    href: "https://ringostat.com/uk/?utm_campaign=partner&utm_medium=referral&utm_source=vrk&utm_term=partner-vrk-promocode",
  },
  {
    name: "NetPeak",
    logo: "/partners/netpeak.png",
    href: "https://netpeak.ua/",
  },
  {
    name: "UniTalk",
    logo: "/partners/unitalk.png",
    href: "https://unitalk.cloud/uk/sprobuj-bezkoshtovnyj-testovyj-period-14-dniv/?utm_source=partner&utm_content=vrkpromo30",
  },
  {
    name: "Binotel",
    logo: "/partners/binotel.png",
    href: "https://www.binotel.ua/connect?promo-code=SQ78489",
  },
  {
    name: "PPP-industry",
    logo: "/partners/ppp-industry.png",
    href: "https://ppp-industry.com/",
  },
  {
    name: "LevelUp",
    logo: "/partners/levelup.png",
    href: "https://www.instagram.com/viktoriakulinka?igsh=bDd2MDA2eXRmNXRt",
  },
] as const;

/* ── Блок 1. Перший екран ───────────────────────────────────────────── */
export const hero = {
  badge: "Офіційний Google Partner",
  title:
    "Google Ads та performance-маркетинг для бізнесу, який хоче масштабувати продажі",
  subtitle:
    "VRK Partners допомагає eCommerce, B2B, медичним проєктам, онлайн-школам, SaaS та локальному бізнесу отримувати стабільні ліди, продажі та прозорий ROI реклами.",
  trust: "Офіційний Google Partner · понад 500 000 $ рекламних бюджетів",
  trustHref: "https://partnersdirectory.withgoogle.com/intl/ru/partners/8023128461",
  primaryCta: "Отримати консультацію",
  secondaryCta: "Замовити аудит Google Ads",
  formTitle: "Залиште заявку",
  formNote: "Відповімо протягом робочого дня. Без спаму та нав'язування.",
} as const;

/* ── Блок «Про нас» (команда) ───────────────────────────────────────── */
export const about = {
  eyebrow: "Про нас",
  title: "Команда, яка веде ваш Google Ads",
  text: "Двоє співзасновників із практичним досвідом у PPC та управлінні проєктами — працюємо з вами напряму, без прошарку менеджерів.",
  members: [
    {
      key: "vladyslav",
      name: "Владислав Рахманін",
      photo: "/team/vladyslav.jpg",
      experience: "4 роки",
      role: "Co-Founder, Team Lead",
      skills:
        "Senior PPC Google Ads, Розробка стратегії, Налаштування рекламних кампаній, Налаштування Аналітики, Google Partner",
    },
    {
      key: "kostiantyn",
      name: "Костянтин Чуєв",
      photo: "/team/kostiantyn.jpg",
      experience: "7 років",
      role: "Co-Founder, Керівник Проектів",
      skills:
        "Маркетолог, Ведення бізнес-процесів, Комунікація, Розробка Стратегії",
    },
  ],
} as const;

/* ── Блок 2. Послуги Google Ads ─────────────────────────────────────── */
export const services = {
  eyebrow: "Послуги",
  title: "Комплексне ведення Google Ads під заявки, продажі та ROI",
  text: "Ми не просто запускаємо рекламу — будуємо систему залучення клієнтів на основі аналітики, unit-економіки та бізнес-цілей.",
  cta: "Обговорити рекламні кампанії",
  items: [
    {
      key: "search",
      name: "Пошукова реклама Google Ads",
      desc: "Пошукова реклама Google Ads допомагає залучати клієнтів саме в момент пошуку товару або послуги. Оптимізуємо кампанії під заявки, продажі та ROI.",
      mockup: "/mockups/search-ad.png",
      mockupFull: "/mockups/search-full.png",
      mockupAlt: "Приклад пошукового оголошення Google Ads на мобільному",
      previewWide: false,
    },
    {
      key: "shopping",
      name: "Shopping реклама Google Ads",
      desc: "Shopping реклама дозволяє показувати товари у пошуку Google з фото, ціною та описом. Ідеальне рішення для eCommerce.",
      mockup: "/mockups/shopping-ad.png",
      mockupFull: "/mockups/shopping-full.png",
      mockupAlt: "Приклад товарної реклами Google Shopping",
      previewWide: true,
    },
    {
      key: "pmax",
      name: "Performance Max",
      desc: "Performance Max використовує AI Google для масштабування результатів через усі рекламні канали Google.",
      mockup: "/mockups/pmax-ad.jpg",
      mockupFull: "/mockups/pmax-full.jpg",
      mockupAlt: "Приклад кампанії Performance Max на майданчиках Google",
      previewWide: true,
    },
    {
      key: "youtube",
      name: "YouTube Ads",
      desc: "YouTube Ads допомагає масштабувати впізнаваність бренду, охоплення та продажі через відеорекламу.",
      mockup: "/mockups/video-ad.png",
      mockupFull: "/mockups/video-full.png",
      mockupAlt: "Приклад відеореклами YouTube Ads",
      previewWide: true,
    },
    {
      key: "demandgen",
      name: "Demand Gen",
      desc: "Demand Gen кампанії формують попит та дозволяють залучати нову аудиторію через Discover, Gmail та YouTube.",
      mockup: "/mockups/demandgen-ad.jpg",
      mockupFull: "/mockups/demandgen-full.jpg",
      mockupAlt: "Приклад реклами Demand Gen у Gmail на мобільному",
      previewWide: true,
    },
    {
      key: "remarketing",
      name: "Ремаркетинг",
      desc: "Ремаркетинг повертає користувачів, які вже взаємодіяли з вашим сайтом або рекламою.",
      mockup: "/mockups/remarketing-ad.png",
      mockupFull: "/mockups/remarketing-full.png",
      mockupAlt: "Приклад банера ремаркетингу",
      previewWide: true,
    },
    {
      key: "display",
      name: "Google Display Network (КМС)",
      desc: "Медійна реклама Google Display Network дозволяє масштабувати охоплення та brand awareness.",
      mockup: "/mockups/display-ad.png",
      mockupFull: "/mockups/display-full.png",
      mockupAlt: "Приклад банера в контекстно-медійній мережі Google",
      previewWide: true,
    },
    {
      key: "app",
      name: "Реклама мобільних додатків",
      desc: "App Campaigns допомагають збільшувати installs та цільові дії всередині мобільного додатку.",
      mockup: "/mockups/app-ad.png",
      mockupFull: "/mockups/app-full.png",
      mockupAlt: "Приклад реклами застосунку на смартфоні",
      previewWide: false,
    },
    {
      key: "maps",
      name: "Google Maps Ads",
      desc: "Google Maps Ads підходить для локального бізнесу та допомагає отримувати більше дзвінків і маршрутів.",
      mockup: "/mockups/maps-ad.jpg",
      mockupFull: "/mockups/maps-full.jpg",
      mockupAlt: "Приклад реклами в Google Картах",
      previewWide: false,
    },
  ],
  popup: {
    title: "Обговорити рекламні кампанії",
    note: "Підкажемо, які формати дадуть результат саме у вашій ніші.",
  },
} as const;

/* ── Блок 3. Аудит, стратегія, підготовка ───────────────────────────── */
export const audit = {
  eyebrow: "До запуску та під час оптимізації",
  title: "Знаходимо точки росту до запуску та під час оптимізації реклами",
  cta: "Замовити аудит",
  ctaSecondary: "Отримати прорахунок",
  items: [
    {
      name: "Аудит Google Ads",
      desc: "Ми аналізуємо:",
      points: [
        "Структуру рекламного акаунту",
        "Ключові слова",
        "Пошукові запити",
        "Стратегії ставок",
        "Конверсії",
        "Аналітику",
        "Якість трафіку",
      ],
    },
    {
      name: "Підготовка сайту до реклами",
      desc: "Ми допомагаємо:",
      points: [
        "Підготувати сайт до запуску реклами",
        "Перевірити UX",
        "Налаштувати аналітику",
        "Встановити GTM та GA4",
        "Налаштувати conversion tracking",
        "Перевірити мобільну версію",
      ],
    },
    {
      name: "Стратегія просування",
      desc: "Покроковий план запуску, оптимізації та масштабування реклами з урахуванням маркетингу, аналітики та бізнес-цілей. Дає чітке розуміння дій із технічного та маркетингового боку для найкращих результатів. Стратегія поділена на 3 частини:",
      points: [
        "Маркетингова частина",
        "Технічна частина",
        "Наступні дії щодо оптимізації та масштабування",
      ],
    },
    {
      name: "Прорахунок",
      desc: "Оцінка рекламного потенціалу: прогноз бюджету, вартості заявок і підбір найбільш ефективних GEO під цілі бізнесу.",
      points: [
        "Файл із вкладками по різних GEO",
        "Ціна конверсії за різних бюджетів під кожне GEO",
        "Не більше 5 GEO в одному прорахунку",
      ],
    },
  ],
  formTitle: "Заявка на аудит, стратегію або прорахунок",
  services: ["Аудит", "Стратегія", "Прорахунок", "Підготовка сайту"],
} as const;

/* ── Блок 4. Довіра, Google Partner, кейси ──────────────────────────── */
export const trust = {
  eyebrow: "Довіра та результати",
  title: "Офіційний Google Partner з фокусом на результат і прозору аналітику",
  facts: [
    "Понад 500 000 $ рекламних бюджетів за останні 90 днів",
    "Команда спеціалістів з Google Ads",
    "Працюємо з Україною, Європою, США та іншими країнами",
  ],
  highlights: [
    { value: "3022%", label: "ROAS для eCommerce" },
    { value: "5,20 $", label: "CPL для товарних лендингів" },
    { value: "125 грн", label: "за реєстрацію для онлайн-школи" },
  ],
  niches: ["E-commerce", "B2B послуги", "B2C послуги", "EdTech", "SaaS / Онлайн-сервіси"],
  cta: "Переглянути кейси",
  ctaSecondary: "Отримати консультацію",
  caseHint: "Оберіть нішу, далі — кейс. Контент змінюється без перезавантаження.",
  /**
   * Кейси згруповані по нішах: ніша → кейс → контент.
   * У ніші може бути кілька кейсів (напр. EdTech). Структура полів довільна —
   * закладка під майбутнє редагування через адмінку (поза обсягом версії).
   */
  caseGroups: [
    {
      id: "ecommerce",
      niche: "E-commerce",
      cases: [
        {
          id: "global-electro",
          client: "global-electro.com.ua",
          href: "https://global-electro.com.ua/",
          title: "Інтернет-магазин товарів для освітлення",
          metrics: [
            { value: "4 654%", label: "ROAS" },
            { value: "4,8 млн грн", label: "дохід із кошика" },
            { value: "103 193 грн", label: "вартість реклами" },
          ],
        },
        {
          id: "concerts-de",
          client: "Продаж білетів на концерти (NDA)",
          title: "Концерти в Німеччині",
          metrics: [
            { value: "3 978%", label: "ROAS" },
            { value: "166 653 €", label: "дохід" },
            { value: "4 190 €", label: "бюджет" },
          ],
        },
        {
          id: "turbokitchen",
          client: "TurboKitchen",
          href: "https://pull.sokany.kiev.ua/",
          title: "Товарні односторінкові лендинги",
          task: "Продавати товари через односторінкові лендинги без товарної реклами: 50–70 лідів на день, ROAS 250–300%.",
          image: "/cases/turbokitchen.png",
          metrics: [
            { value: "292%", label: "ROAS" },
            { value: "5,20 $", label: "вартість ліда" },
            { value: "3 172", label: "лідів" },
            { value: "16 511 $", label: "рекламний бюджет" },
          ],
          approach: [
            "Структура акаунту 1 кампанія = 1 товар = 1 лендинг",
            "Якісне налаштування конверсій на кожному лендингу",
            "Підрахунок ROAS у CRM за реальними замовленнями через UTM",
            "Персоналізовані сигнали аудиторій під кожен товар",
            "Оптимізація та перерозподіл бюджету з малоефективних кампаній",
          ],
        },
        {
          id: "healthtree",
          client: "healthtree.ca",
          href: "https://healthtree.ca/",
          title: "eCommerce · Канада",
          metrics: [
            { value: "400%", label: "ROAS (останній місяць)" },
            { value: "200%", label: "ROAS" },
            { value: "9 000 $", label: "бюджет" },
          ],
        },
        {
          id: "pharmacy",
          client: "Онлайн-аптека (NDA)",
          title: "eCommerce · Україна",
          task: "Збільшили обсяг продажів на 30%.",
          metrics: [
            { value: "2 700%", label: "ROAS" },
            { value: "2 000", label: "продажів на місяць" },
            { value: "1,94%", label: "коефіцієнт конверсії" },
          ],
        },
        {
          id: "prof1group",
          client: "prof1group.ua",
          href: "https://prof1group.ua/",
          title: "Інтернет-магазин військового одягу",
          metrics: [
            { value: "3 022%", label: "ROAS" },
            { value: "17,3 млн грн", label: "сума продажів" },
            { value: "573 033 грн", label: "бюджет" },
          ],
        },
        {
          id: "zola",
          client: "zola.ua",
          href: "https://zola.ua/",
          title: "Інтернет-магазин косметики",
          metrics: [
            { value: "1 047%", label: "ROAS" },
            { value: "356 000 грн", label: "дохід із кошика" },
            { value: "34 000 грн", label: "вартість реклами" },
          ],
        },
      ],
    },
    {
      id: "b2b",
      niche: "B2B послуги",
      cases: [
        {
          id: "parktrans",
          client: "parktrans.com.ua",
          href: "https://parktrans.com.ua/",
          title: "Логістична компанія",
          task: "Дати максимум якісних лідів із мінімумом малих перевезень і коротких відстаней.",
          image: "/cases/parktrans.png",
          metrics: [
            { value: "14 057", label: "звернень" },
            { value: "199,88 грн", label: "вартість звернення" },
            { value: "2,8 млн грн", label: "рекламний бюджет" },
            { value: "від 2 т", label: "фокус на вантажах" },
          ],
          approach: [
            "Кластеризація семантичного ядра за наміром",
            "Окремі кампанії на вихідні, коли аукціон конкурентів порожній",
            "Колтрекінг і таблиця лідів за датами та UTM",
            "Оптимізація бюджетів за статусом якості лідів із CRM",
            "ТЗ дизайнеру на креативи Pmax під УТП та мінімальну вагу вантажу",
          ],
        },
        {
          id: "energy",
          client: "Альтернативна енергетика (NDA)",
          title: "Квал-ліди з чеком від 100 000 $",
          task: "Ціль — 200 $ за квал-лід (бажано чек від 100 000 $).",
          metrics: [
            { value: "34", label: "кваліфікованих лідів" },
            { value: "9 137 грн", label: "ціна квал-ліда" },
            { value: "325", label: "лідів усього" },
            { value: "310 656 грн", label: "бюджет" },
          ],
        },
        {
          id: "ub-tech",
          client: "ub-tech.com.ua",
          href: "https://ub-tech.com.ua/",
          title: "Розробка сайтів",
          task: "Ціль: 5 і більше клієнтів на місяць.",
          metrics: [
            { value: "56", label: "лідів" },
            { value: "24", label: "цікавих ліда" },
            { value: "1 334 грн", label: "вартість ліда" },
            { value: "74 707 грн", label: "бюджет" },
          ],
        },
        {
          id: "czu",
          client: "czu.com.ua",
          href: "https://czu.com.ua/",
          title: "Товари для військових · оптові запити",
          task: "Отримувати максимум оптових запитів (чек від 100 000 грн), ціна клієнта 1–3 % від реалізованої угоди.",
          image: "/cases/czu.png",
          metrics: [
            { value: "84", label: "ліда" },
            { value: "27", label: "цікавих лідів" },
            { value: "682,81 грн", label: "вартість ліда" },
            { value: "від 100 000 грн", label: "середній чек" },
          ],
          approach: [
            "Конверсії та додаткові дії: копіювання пошти, початок форми",
            "Налаштування колтрекінгу та розширеного відстеження",
            "Спеціальна таблиця лідів за датами та UTM-мітками",
            "Перерозподіл бюджету за даними якості лідів у перші тижні",
            "Pmax: персоналізовані групи об'єктів під кожен напрям-лендинг",
          ],
        },
        {
          id: "moving-b2b",
          client: "Мувінг · Консалтинг B2B (NDA)",
          title: "B2B-послуги",
          metrics: [
            { value: "56", label: "лідів" },
            { value: "1,3 млн PLN", label: "вартість запропонованих контрактів" },
            { value: "48 823 PLN", label: "бюджет" },
          ],
        },
      ],
    },
    {
      id: "b2c",
      niche: "B2C послуги",
      cases: [
        {
          id: "helyos",
          client: "helyos.com.ua",
          href: "https://helyos.com.ua/",
          title: "Медична клініка «Геліос»",
          task: "За 2,5 місяці збільшили кількість звернень із реклами у 8 разів.",
          image: "/cases/helyos.png",
          metrics: [
            { value: "835", label: "звернень на місяць" },
            { value: "41,77 грн", label: "вартість звернення" },
            { value: "7,73%", label: "коефіцієнт конверсії" },
          ],
        },
        {
          id: "medicasano",
          client: "medicasano.com.ua",
          href: "https://medicasano.com.ua/",
          title: "Медична клініка",
          metrics: [
            { value: "172", label: "ліда" },
            { value: "328,65 грн", label: "вартість ліда" },
            { value: "56 527 грн", label: "бюджет" },
          ],
        },
        {
          id: "vidnova",
          client: "vidnova.dental",
          href: "https://vidnova.dental/ua",
          title: "Стоматологія у Львові",
          metrics: [
            { value: "177", label: "лідів" },
            { value: "580,32 грн", label: "вартість ліда" },
            { value: "103 008 грн", label: "бюджет" },
          ],
        },
        {
          id: "bloomnails",
          client: "bloomnails.com.ua",
          href: "https://bloomnails.com.ua/ua",
          title: "Салон краси",
          metrics: [
            { value: "5 330", label: "лідів" },
            { value: "54,59 грн", label: "вартість звернення" },
            { value: "291 000 грн", label: "вартість реклами" },
          ],
        },
        {
          id: "europeservice",
          client: "europeservice.org",
          href: "https://europeservice.org/",
          title: "Робота для українців у Європі",
          task: "Масштабувати витрати ефективніше та втримати ціну за лід у межах 40–50 грн.",
          image: "/cases/europeservice.png",
          metrics: [
            { value: "14 015", label: "лідів" },
            { value: "32,52 грн", label: "вартість ліда" },
            { value: "455 850 грн", label: "рекламний бюджет" },
            { value: "Основний канал", label: "Google Ads після змін" },
          ],
          approach: [
            "Аудит акаунту — знайдено точки масштабування",
            "Виправлено помилки відстеження (багато дублів), розширені конверсії",
            "А/Б-тест широкої відповідності vs фразова/точна — позитивний",
            "Pmax-кампанія в допомогу пошуку, тести нових ГЕО",
            "Оптимізація за якістю лідів із CRM у Looker Studio + колтрекінг",
          ],
        },
      ],
    },
    {
      id: "edtech",
      niche: "EdTech",
      cases: [
        {
          id: "cryptology",
          client: "Cryptology Key",
          title: "FinTech-освіта · школа трейдингу",
          task: "Платний курс — ліди до 1 000 грн з ROAS 300 %+; безкоштовний курс — мінімальна вартість ліда; просування YouTube-контенту.",
          image: "/cases/cryptology.png",
          metrics: [
            { value: "300 %+", label: "ROAS платний курс" },
            { value: "802 грн", label: "ліда на платний курс" },
            { value: "125 грн", label: "реєстрація на безкоштовний" },
            { value: "3,09 грн", label: "підписка на YouTube" },
          ],
          approach: [
            "Відбілювання лендингів, щоб уникнути блокувань (крипта, фінанси)",
            "Розширені конверсії з міждоменним відстеженням",
            "ТЗ на відео для лідогенерації на YouTube + участь у покращенні",
            "Постійна комунікація з менеджером Google проти блокувань",
            "Demand Gen на авто-оновлюваних списках якісних лідів, А/Б-тести",
          ],
        },
        {
          id: "english-online-1",
          client: "Онлайн-школа англійської (NDA)",
          title: "Реєстрації за дуже низькою ціною",
          metrics: [
            { value: "$1,82", label: "вартість реєстрації" },
            { value: "6,13%", label: "конверсія в реєстрацію" },
            { value: "382", label: "конверсії всього" },
            { value: "2,5 млн", label: "показів" },
          ],
        },
        {
          id: "english-school",
          client: "Школа англійської онлайн №2 (NDA)",
          title: "Якісні ліди з мінімумом спаму",
          task: "Ціна пробного уроку в межах 2 000–3 000 грн.",
          image: "/cases/english-school.png",
          metrics: [
            { value: "1 887 грн", label: "ціна пробного уроку" },
            { value: "85", label: "пробних уроків" },
            { value: "196", label: "заявок" },
            { value: "160 438 грн", label: "рекламний бюджет" },
          ],
          approach: [
            "Логіка офлайн-конверсій із CRM за статусами лідів",
            "Авто-оновлювані списки клієнтів і сигнали для кампаній попиту",
            "Брендовий пошук із виключенням наявних студентів",
            "ТЗ на відеорекламу YouTube та креативи Pmax / Demand Gen",
            "Microsoft Clarity для аналізу аномалій поведінки на сайті",
          ],
        },
        {
          id: "edtech-crypto",
          client: "Курси з криптовалюти (NDA)",
          title: "EdTech · крипто-курси",
          metrics: [
            { value: "3,54 $", label: "вартість ліда (1-й місяць)" },
            { value: "1 286", label: "лідів (1-й місяць)" },
            { value: "4 547 $", label: "бюджет" },
          ],
        },
        {
          id: "jayjay",
          client: "jayjay.co",
          href: "https://jayjay.co/",
          title: "Онлайн-курси IT в Індонезії",
          task: "Курси IT: QA, SMM, UI/UX, Web Dev — лише онлайн, без вебінарів.",
          image: "/cases/jayjay.png",
          metrics: [
            { value: "3,25 $", label: "вартість звернення" },
            { value: "382", label: "лідів" },
            { value: "1 216 $", label: "бюджет" },
          ],
        },
      ],
    },
    {
      id: "saas",
      niche: "SaaS / Онлайн-сервіси",
      cases: [
        {
          id: "digigreet",
          client: "digigreet.com",
          href: "https://www.digigreet.com/",
          title: "SaaS · United Kingdom",
          task: "Системи керування відвідувачами для бізнесу.",
          metrics: [
            { value: "38 £", label: "вартість звернення" },
            { value: "26", label: "лідів" },
            { value: "1 000 £", label: "вартість реклами" },
          ],
        },
        {
          id: "subscription-funnel",
          client: "Маркетинговий інструментарій (NDA)",
          title: "SaaS · B2B / B2C · платні підписки",
          task: "Ціль: знизити вартість підписки нижче 20 € та масштабувати; налаштувати передачу офлайн-конверсій.",
          metrics: [
            { value: "14,69 €", label: "вартість підписки" },
            { value: "1 620", label: "підписок" },
            { value: "23 799 €", label: "вартість реклами" },
          ],
        },
      ],
    },
  ],
} as const;

/* ── Блок 5. Як проходить робота + бонус Google ─────────────────────── */
export const workflow = {
  eyebrow: "Як проходить робота",
  title: "Прозорий процес від аналізу до масштабування кампаній",
  cta: "Обговорити проєкт",
  steps: [
    { n: 1, title: "Брифінг і аналіз бізнес-цілей" },
    { n: 2, title: "Аудит поточної реклами або підготовка до запуску" },
    { n: 3, title: "Розробка стратегії та структури кампаній" },
    { n: 4, title: "Складання плану робіт" },
    { n: 5, title: "Налаштування аналітики та відстеження" },
    { n: 6, title: "Запуск реклами, масштабування прибуткових кампаній" },
    { n: 7, title: "Прозора звітність і рекомендації щодо сайту та рекламних можливостей" },
  ],
  bonus: {
    badge: "Бонус від Google",
    title: "Отримання бонусу від Google Ads для наших клієнтів",
    desc: "Як офіційний Google Partner підключаємо нові акаунти через наш MCC і допомагаємо отримати бонусні кошти на рекламу від Google.",
    terms: [
      { label: "Розмір бонусу", value: "До 6 000 бонусних $ на рекламу", highlight: "6 000 бонусних $" },
      { label: "Кому", value: "Новим акаунтам через наш Google Partner MCC" },
      { label: "Активація", value: "Кошти зараховуються майже одразу після виконання умов" },
    ],
    cta: "Отримати бонус",
  },
} as const;

/* ── Блок 6. Фінальний CTA + FAQ + контакти ─────────────────────────── */
export const finalCta = {
  eyebrow: "Залиште заявку",
  title: "Хочете зрозуміти потенціал реклами для вашого бізнесу?",
  text: "Залиште заявку — команда VRK Partners проаналізує вашу задачу та підкаже, з чого краще почати: аудит, стратегія, запуск або масштабування Google Ads.",
  primaryCta: "Залишити заявку",
  telegramCta: "Написати в Telegram",
} as const;

export const faq = [
  {
    q: "Чим ви відрізняєтесь від інших агенцій?",
    a: "Підходом: фокусуємось на цілях бізнесу, а не просто на рекламі — працюємо так, щоб вона приносила прибуток. Плюс рівень аналітики та технічного налаштування кампаній і цілей.",
  },
  {
    q: "Чим ваші послуги кращі за ринок?",
    a: "Працюємо лише на кінцеві показники клієнта — CAC, ROAS, LTV, CPQL — з урахуванням відмін, повернень, коригувань і різних моделей атрибуції. Кажемо все як є й завжди можемо пояснити, що відбувається.",
  },
  {
    q: "За який час я побачу перші стабільні результати?",
    a: "Зазвичай 1–3 місяці: кампаніям потрібен час на навчання, а в багатьох нішах вікно атрибуції більше за тиждень.",
  },
  {
    q: "Який клієнт для вас ідеальний?",
    a: "Бізнес, який уже працює з рекламою та має бюджет на Google Ads від 2 500 $ і потребує масштабування, оптимізації або виходу на цільові показники вперше.",
  },
  {
    q: "Скільки людей працюватиме над проєктом?",
    a: "Загалом 6: проджект-менеджер, тімлід, фахівець і керівник напряму, а також аудитор сайтів і дизайнер — періодично.",
  },
  {
    q: "Чому я маю обрати саме вас?",
    a: "Після аудиту й прорахунку чесно скажемо, чи досяжні ваші цілі та в які строки. Скоригуємо маркетингову модель під вашу вигоду — і відмовимось від проєкту, якщо вважатимемо цілі недосяжними, залишивши рекомендації.",
  },
  {
    q: "З якими ринками ви працюєте?",
    a: "Найчастіше: ЄС, Україна, США та Канада.",
  },
  {
    q: "Які KPI ви вважаєте ключовими?",
    a: "CAC, CPL / CPQL, ROAS / ROMI (за цінністю та валовим прибутком), LTV. Працюємо саме на кінцеві показники бізнесу.",
  },
  {
    q: "Чому ви проти щотижневих звітів?",
    a: "Кампаніям потрібно понад 5–7 днів на навчання, а вікно атрибуції в багатьох нішах більше за тиждень — тижневі дані часто некоректні й змінюються згодом.",
  },
  {
    q: "Чому ви працюєте лише за 100% передоплатою?",
    a: "Стартові чеки в нас навмисно низькі для нашого рівня експертизи — ми будуємо довгострокові відносини. За такої моделі та фінансового планування кампаній працюємо лише за передоплатою.",
  },
] as const;

/* ── Формати реклами для поп-апів ───────────────────────────────────── */
export const adFormats = [
  "Пошукова реклама",
  "Shopping",
  "Performance Max",
  "YouTube Ads",
  "Demand Gen",
  "Ремаркетинг",
  "КМС",
  "App Campaigns",
  "Google Maps Ads",
  "Ще не визначився(лась)",
] as const;

export const budgetRanges = [
  "До 500 $ / міс",
  "500–2 000 $ / міс",
  "2 000–5 000 $ / міс",
  "5 000–10 000 $ / міс",
  "Понад 10 000 $ / міс",
] as const;

export const goals = ["Ліди", "Продажі", "Аудит", "Масштабування"] as const;
