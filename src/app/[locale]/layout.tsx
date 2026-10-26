import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ModalProvider } from "@/features/landing/components/forms/ModalProvider";
import { RevealObserver } from "@/features/landing/components/layout/RevealObserver";
import { FitText } from "@/features/landing/components/layout/FitText";
import { WordReveal } from "@/features/landing/components/layout/WordReveal";
import { SlideIn } from "@/features/landing/components/layout/SlideIn";
import { WordRevealTuner } from "@/features/landing/components/layout/WordRevealTuner";
import { HashScroll } from "@/features/landing/components/layout/HashScroll";
import { SiteBackground } from "@/features/landing/components/layout/SiteBackground";
import { UtmTracker } from "@/features/landing/components/layout/UtmTracker";
import { Header } from "@/features/landing/components/sections/Header";
import { Footer } from "@/features/landing/components/sections/Footer";
import { siteUrl } from "@/shared/config/site";
import { routing } from "@/i18n/routing";
import {
  getAnalyticsEventsUseCases,
  getContentUseCases,
  getTrackingTagUseCases,
} from "@composition/container";
import { mergeSeo, effectiveOrg } from "@core/domain/content/seo";
import type { AnalyticsEventsConfig } from "@core/domain/analytics/registry";
import { adsSendToList } from "@core/domain/tracking/tags";
import type { SiteMessages } from "@core/domain/content/site-messages";
import { getDefaultSeo } from "@/shared/content/defaults";
import { liteDetectionScript } from "@core/domain/layout/device-tier";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "";
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
const GOOGLE_VERIFICATION = process.env.GOOGLE_VERIFICATION ?? "";

// Верифікація пошукових систем — лише на публічних сторінках, не на /admin/*.
export const metadata: Metadata = GOOGLE_VERIFICATION
  ? { verification: { google: GOOGLE_VERIFICATION } }
  : {};

// TTL-фолбэк для кеша цього layout-сегмента. Основний механізм інвалідації —
// revalidatePath('/', 'layout') після кожної мутації контенту/тегів з адмінки;
// цей revalidate=300 спрацьовує тільки якщо on-demand revalidate чомусь не прийшов.
export const revalidate = 300;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Інлайн window.__analyticsEvents — повний merged-конфіг імен/вкл-викл подій, і
// window.__awConversions — send_to Ads-тегів з conversion label (розділ 15: конверсія
// викликається на сайті після gtag('set','user_data'), до generate_lead).
// Значення вже пройшли whitelist-валідацію + екранування "<".
function AnalyticsEventsScript({
  analyticsEvents,
  awConversions,
}: {
  analyticsEvents: AnalyticsEventsConfig;
  awConversions: string[];
}) {
  const json = JSON.stringify(analyticsEvents).replace(/</g, "\\u003c");
  const aw = JSON.stringify(awConversions).replace(/</g, "\\u003c");
  return (
    <Script id="analytics-config" strategy="afterInteractive">
      {`window.__analyticsEvents = ${json}; window.__awConversions = ${aw};`}
    </Script>
  );
}

// Consent Mode v2 defaults — рендерується РІВНО один раз, ДО всіх тегів.
// Замовник працює по Україні — аналога GDPR-банера немає, дефолт granted.
// При ad_storage: denied конверсійний тег Google Ads деградує до моделювання.
function ConsentDefaults() {
  return (
    <Script id="consent-defaults" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){window.dataLayer.push(arguments);}
        gtag('consent', 'default', {
          ad_storage:           'granted',
          analytics_storage:    'granted',
          ad_user_data:         'granted',
          ad_personalization:   'granted'
        });
      `}
    </Script>
  );
}

// Завантажувач GTM-контейнера.
function GtmScript({ id }: { id: string }) {
  return (
    <Script id={`gtm-${id}`} strategy="afterInteractive">
      {`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${id}');
      `}
    </Script>
  );
}

// GA4 + Google Ads через gtag.js. Для AW-тегів — allow_enhanced_conversions.
// ids сортуються: GA4 (G-...) перед AW (AW-...).
function GtagScripts({ ids }: { ids: string[] }) {
  const sorted = [
    ...ids.filter((id) => id.startsWith("G-")),
    ...ids.filter((id) => !id.startsWith("G-")),
  ];

  const configCalls = sorted
    .map((id) => {
      if (id.startsWith("AW-")) {
        return `gtag('config', '${id}', {'allow_enhanced_conversions': true});`;
      }
      return `gtag('config', '${id}');`;
    })
    .join("\n");

  return (
    <>
      <Script
        id="gtag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${sorted[0]}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-config" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          ${configCalls}
        `}
      </Script>
    </>
  );
}

// Noscript fallback GTM.
function GtmNoScript({ id }: { id: string }) {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${id}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}

// JSON-LD Organization: назва/опис — із метаданих (SEO), а контакти (email/телефон/
// Telegram) — з КОНТАКТІВ сайту (messages.site), щоб було єдине джерело правди й
// автосинхронізація зі вкладкою «Контент». Тип схеми лишається статичним.
function buildJsonLd(args: {
  orgName: string
  orgDescription: string
  email: string
  phone: string
  telegram: string
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: args.orgName,
    url: siteUrl,
    description: args.orgDescription,
    email: args.email,
    telephone: args.phone,
    sameAs: [args.telegram],
    areaServed: ["UA", "EU", "US"],
    knowsAbout: [
      "Google Ads",
      "Performance Max",
      "YouTube Ads",
      "Demand Gen",
      "PPC",
    ],
  };
}

// Layout сайту — обгортка публічних сторінок (головна, /thanks, юр.сторінки, 404).
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Усі читання fail-safe: помилка БД → дефолти (сайт не падає).
  const [tags, analyticsEvents, messages, seoOverrides] = await Promise.all([
    getTrackingTagUseCases().listEnabledForSite(),
    getAnalyticsEventsUseCases().getMergedConfig(),
    getMessages(),
    getContentUseCases().getSeoOverrides(),
  ]);
  const site = (messages as unknown as SiteMessages).site;
  const seo = mergeSeo(getDefaultSeo(), seoOverrides);
  const org = effectiveOrg(seo, site.name);
  const jsonLd = buildJsonLd({
    orgName: org.name,
    orgDescription: org.description,
    email: site.email,
    phone: site.phone,
    telegram: site.telegram,
  });

  // Фолбэк на NEXT_PUBLIC_GTM_ID — тільки якщо немає жодного включеного тегу в БД.
  const gtmIds =
    tags.length > 0
      ? tags.filter((t) => t.type === "gtm").map((t) => t.tag_id)
      : GTM_ID
        ? [GTM_ID]
        : [];
  const gtagIds =
    tags.length > 0
      ? tags.filter((t) => t.type === "ga4" || t.type === "aw").map((t) => t.tag_id)
      : [];

  const hasAnyTag = gtmIds.length > 0 || gtagIds.length > 0;
  const awConversions = adsSendToList(tags);

  return (
    <>
      {/* Попереднє зʼєднання з доменами аналітики — швидші перші події */}
      {hasAnyTag && (
        <>
          <link rel="preconnect" href="https://www.googletagmanager.com" />
          <link rel="preconnect" href="https://www.google-analytics.com" />
          <link rel="preconnect" href="https://analytics.google.com" />
          <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
          <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        </>
      )}
      {PLAUSIBLE_DOMAIN && (
        <link rel="preconnect" href="https://plausible.io" />
      )}

      {/* Noscript-iframe GTM */}
      {gtmIds.map((id) => (
        <GtmNoScript key={`ns-${id}`} id={id} />
      ))}

      {/* Конфіг аналітики — window.__analyticsEvents (повний merged-конфіг) */}
      <AnalyticsEventsScript analyticsEvents={analyticsEvents} awConversions={awConversions} />

      {/* Consent Mode v2 — ОДИН раз, до будь-яких тегів */}
      {hasAnyTag && <ConsentDefaults />}

      {/* GTM-контейнери з адмінки (або env-фолбэк) */}
      {gtmIds.map((id) => (
        <GtmScript key={id} id={id} />
      ))}

      {/* GA4 / Google Ads напряму через gtag.js */}
      {gtagIds.length > 0 && <GtagScripts ids={gtagIds} />}

      {/* Plausible Analytics — cookie-free, GDPR by design */}
      {PLAUSIBLE_DOMAIN && (
        <Script
          id="plausible"
          src="https://plausible.io/js/script.tagged-events.js"
          data-domain={PLAUSIBLE_DOMAIN}
          strategy="afterInteractive"
        />
      )}

      {/* JSON-LD Organization — SEO лендінгу. Значення редагує клієнт — «<» екрануємо,
          щоб «</script>» у тексті не закрив тег (stored XSS). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* Збір UTM-міток у sessionStorage (атрибуція заявок) */}
      <UtmTracker />

      {/* Тексти сайту (дефолти ⊕ правки клієнта) — клієнтським компонентам через useMessages() */}
      {/* Розгорання слів (крок 4) і виїзд пунктів «Що ви отримуєте?»: до гідрації слова в
          [data-word-reveal] і частини [data-slide-part] приховані класами на <html>, щоб текст не блимав
          яскравим і не «зникав» після першого розрахунку (рішення власника). Два класи, а не один:
          кожен ефект знімає свій при вимкненні. Виконується до розбору розмітки сайту (перед першим
          кадром); «менше руху» / без JS — без класів, текст видимий. Класи знімають
          features/landing/lib/word-reveal і features/landing/lib/slide-in при вимкненні ефекту.
          Тим самим скриптом ставиться клас lite (слабкий пристрій / вбудований браузер / вузький
          вьюпорт — core/domain/layout/device-tier): CSS-блок html.lite у globals.css вимикає
          backdrop-filter, свічення-blur, нескінченні анімації й маски. Без JS класу немає — на мобільному
          фон і так статичний за медіазапитом. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-word-reveal','js-slide-in')}catch(e){}" +
            liteDetectionScript(),
        }}
      />
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ModalProvider>
          <div className="site relative">
            <SiteBackground />
            <RevealObserver />
            <FitText />
            <WordReveal />
            <SlideIn />
            {/* Тимчасова панель підбору параметрів розгорання (лише /?tune-words=1) — прибрати після підбору. */}
            <WordRevealTuner />
            <HashScroll />
            <Header />
            <main>{children}</main>
            <Footer />
          </div>
        </ModalProvider>
      </NextIntlClientProvider>
    </>
  );
}
