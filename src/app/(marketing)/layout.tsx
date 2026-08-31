import type { Metadata } from "next";
import Script from "next/script";
import { ModalProvider } from "@/components/ModalProvider";
import { ContentProvider } from "@/components/ContentProvider";
import { RevealObserver } from "@/components/RevealObserver";
import { HashScroll } from "@/components/HashScroll";
import { SiteBackground } from "@/components/SiteBackground";
import { UtmTracker } from "@/components/UtmTracker";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";
import { site, siteUrl } from "@/config/site";
import { createServiceClient } from "@/lib/supabase/service";
import { getLandingContentOverrides, mergeLandingContent } from "@/lib/content";
import { getSeoOverrides, mergeSeo, effectiveOrg } from "@/lib/seo";
import { TAG_ID_PATTERNS, type TrackingTagType } from "@/lib/tracking-tags";
import {
  ANALYTICS_EVENTS_SETTING_KEY,
  parseAnalyticsEventsConfig,
  getDefaultAnalyticsEvents,
  type AnalyticsEventsConfig,
} from "@/lib/analytics-registry";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "";
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
const GOOGLE_VERIFICATION = process.env.GOOGLE_VERIFICATION ?? "";

// Верифікація пошукових систем — лише на публічних сторінках, не на /admin/*.
export const metadata: Metadata = GOOGLE_VERIFICATION
  ? { verification: { google: GOOGLE_VERIFICATION } }
  : {};

// TTL-фолбэк для кеша цього layout-сегмента. Основний механізм інвалідації —
// revalidatePath('/', 'layout') з /api/admin/tracking-tags після кожної мутації;
// цей revalidate=300 спрацьовує тільки якщо on-demand revalidate чомусь не прийшов.
export const revalidate = 300;

type EnabledTag = { type: TrackingTagType; tag_id: string };

// Серверне читання включених тегів із tracking_tags.
async function getEnabledTrackingTags(): Promise<EnabledTag[]> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("tracking_tags")
      .select("type, tag_id")
      .eq("enabled", true)
      .order("position", { ascending: true });

    if (error) {
      console.error("[marketing/layout] tracking_tags_query_failed", error.message);
      return [];
    }

    // Defense-in-depth: рендеримо тільки ID, що пройшли формат-валідацію.
    return ((data ?? []) as EnabledTag[]).filter(
      (t) => TAG_ID_PATTERNS[t.type]?.test(t.tag_id),
    );
  } catch (err) {
    console.error("[marketing/layout] tracking_tags_unavailable", err);
    return [];
  }
}

// Серверне читання конфігу подій із site_settings.
// Інлайнимо ПОВНИЙ merged-конфіг (дефолти + stored), щоб виключена в адмінці
// точка не «терялася» і не падала в enabled:true на лендингу.
async function getAnalyticsEventsConfig(): Promise<AnalyticsEventsConfig> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("site_settings")
      .select("value")
      .eq("key", ANALYTICS_EVENTS_SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.error("[marketing/layout] analytics_events_query_failed", error.message);
      return getDefaultAnalyticsEvents();
    }

    const stored = data?.value
      ? parseAnalyticsEventsConfig(JSON.parse(data.value))
      : {};

    // Повний мерж: дефолти як база + stored-оверрайди поверх.
    return { ...getDefaultAnalyticsEvents(), ...stored };
  } catch (err) {
    console.error("[marketing/layout] analytics_events_unavailable", err);
    return getDefaultAnalyticsEvents();
  }
}

// Інлайн window.__analyticsEvents — повний merged-конфіг імен/вкл-викл подій.
// Значення вже пройшли whitelist-валідацію + екранування "<".
function AnalyticsEventsScript({
  analyticsEvents,
}: {
  analyticsEvents: AnalyticsEventsConfig;
}) {
  const json = JSON.stringify(analyticsEvents).replace(/</g, "\\u003c");
  return (
    <Script id="analytics-config" strategy="afterInteractive">
      {`window.__analyticsEvents = ${json};`}
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
// Telegram) — з КОНТАКТІВ лендингу (content.site), щоб було єдине джерело правди й
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

// Marketing layout — обгортка публічних сторінок лендінгу
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tags, analyticsEvents, contentOverrides, seoOverrides] = await Promise.all([
    getEnabledTrackingTags(),
    getAnalyticsEventsConfig(),
    getLandingContentOverrides(),
    getSeoOverrides(),
  ]);
  const content = mergeLandingContent(contentOverrides);
  const seo = mergeSeo(seoOverrides);
  const org = effectiveOrg(seo, site.name);
  const jsonLd = buildJsonLd({
    orgName: org.name,
    orgDescription: org.description,
    email: content.site.email,
    phone: content.site.phone,
    telegram: content.site.telegram,
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
      <AnalyticsEventsScript analyticsEvents={analyticsEvents} />

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

      {/* JSON-LD Organization — SEO лендінгу */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Збір UTM-міток у sessionStorage (атрибуція заявок) */}
      <UtmTracker />

      <ContentProvider content={content}>
        <ModalProvider>
          <div className="relative">
            <SiteBackground />
            <RevealObserver />
            <HashScroll />
            <Header />
            <main>{children}</main>
            <Footer />
          </div>
        </ModalProvider>
      </ContentProvider>
    </>
  );
}
