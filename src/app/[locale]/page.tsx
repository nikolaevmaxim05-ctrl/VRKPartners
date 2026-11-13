import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Hero } from "@/features/landing/components/sections/Hero";
import { Usp } from "@/features/landing/components/sections/Usp";
import { About } from "@/features/landing/components/sections/About";
import { Services } from "@/features/landing/components/sections/Services";
import { Audit } from "@/features/landing/components/sections/Audit";
import { Trust } from "@/features/landing/components/sections/Trust";
import { Benefits } from "@/features/landing/components/sections/Benefits";
import { Process } from "@/features/landing/components/sections/Process";
import { FinalCta } from "@/features/landing/components/sections/FinalCta";
import { siteUrl } from "@/shared/config/site";
import { LOCALE_CODES, routing, type AppLocale } from "@/i18n/routing";
import { getContentUseCases } from "@composition/container";
import { isSafeImageUrl } from "@core/domain/content/landing";
import { mergeSeo, effectiveOg, effectiveOrg } from "@core/domain/content/seo";
import { pageVisibility, HOME_NS } from "@core/domain/content/visibility";
import type { SiteMessages } from "@core/domain/content/site-messages";
import { getDefaultSeo } from "@/shared/content/defaults";

// Метаданные главной читаются из merged-конфига (дефолты pageMeta + оверрайды вкладки
// «Метадані»). robots/canonical/metadataBase остаются из корневого layout (инварианты).
// title.absolute — чтобы показать ровно то, что ввёл админ (как в превью сниппета).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const [m, messages] = await Promise.all([
    getContentUseCases().getSeoOverrides().then((o) => mergeSeo(getDefaultSeo(), o)),
    getMessages(),
  ]);
  const siteName = (messages as unknown as SiteMessages).site.name;
  const og = effectiveOg(m);
  const org = effectiveOrg(m, siteName);
  const ogImage = isSafeImageUrl(m.ogImage) ? m.ogImage : "/og.png";
  const ogLocale = (LOCALE_CODES[locale as AppLocale] ?? LOCALE_CODES[routing.defaultLocale]).og;
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: ogLocale,
      url: siteUrl,
      siteName: org.name,
      title: og.title,
      description: og.description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: org.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: og.title,
      description: og.description,
      images: [ogImage],
    },
  };
}

// Главная: секции в порядке сайта. Скрытый блок НЕ попадает в DOM (раздел 9);
// список скрытого — messages.home.hidden (правка клиента из админки).
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = (await getMessages()) as unknown as SiteMessages;
  const vis = pageVisibility(HOME_NS, messages.home.hidden);

  // Ровно один h1 (раздел 14): если первый экран скрыт, h1 получает первый видимый блок.
  const order = ["usp", "about", "services", "audit", "cases", "benefits", "process", "finalCta"] as const;
  const firstVisible = vis.shown("hero")
    ? null
    : order.find((id) => vis.shown(id) || (id === "finalCta" && vis.shown("faq"))) ?? null;
  const titleAs = (id: (typeof order)[number]) => (firstVisible === id ? "h1" : "h2");

  return (
    <>
      {vis.shown("hero") && <Hero />}
      {vis.shown("usp") && <Usp titleAs={titleAs("usp")} />}
      {vis.shown("about") && <About titleAs={titleAs("about")} />}
      {vis.shown("services") && <Services titleAs={titleAs("services")} />}
      {vis.shown("audit") && <Audit titleAs={titleAs("audit")} />}
      {vis.shown("cases") && <Trust titleAs={titleAs("cases")} />}
      {vis.shown("benefits") && <Benefits titleAs={titleAs("benefits")} />}
      {vis.shown("process") && <Process titleAs={titleAs("process")} />}
      {(vis.shown("faq") || vis.shown("finalCta")) && <FinalCta titleAs={titleAs("finalCta")} />}
    </>
  );
}
