import type { Metadata } from "next";
import { Hero } from "@/features/landing/components/sections/Hero";
import { Usp } from "@/features/landing/components/sections/Usp";
import { About } from "@/features/landing/components/sections/About";
import { Services } from "@/features/landing/components/sections/Services";
import { Audit } from "@/features/landing/components/sections/Audit";
import { Trust } from "@/features/landing/components/sections/Trust";
import { Process } from "@/features/landing/components/sections/Process";
import { FinalCta } from "@/features/landing/components/sections/FinalCta";
import { site, siteUrl, aboutSectionVisible } from "@/shared/config/site";
import { getContentUseCases } from "@composition/container";
import { isSafeImageUrl } from "@core/domain/content/landing";
import { mergeSeo, effectiveOg, effectiveOrg } from "@core/domain/content/seo";
import { getDefaultSeo } from "@/shared/content/defaults";

// Метадані головної читаються з merged-конфігу (дефолти config/site.ts + оверрайди
// адмінки). robots/canonical/metadataBase лишаються з кореневого layout (інваріанти).
// title.absolute — щоб показати рівно те, що ввів адмін (як у прев'ю сніпета).
export async function generateMetadata(): Promise<Metadata> {
  const m = mergeSeo(getDefaultSeo(), await getContentUseCases().getSeoOverrides());
  const og = effectiveOg(m);
  const org = effectiveOrg(m, site.name);
  const ogImage = isSafeImageUrl(m.ogImage) ? m.ogImage : "/og.png";
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "uk_UA",
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

export default function HomePage() {
  return (
    <>
      <Hero />
      <Usp />
      {/* Блок «Про нас (команда)» тимчасово прихований прапорцем aboutSectionVisible
          (config/site.ts). Код і контент лишаються — вмикання одним прапорцем. */}
      {aboutSectionVisible && <About />}
      <Services />
      <Audit />
      <Trust />
      <Process />
      <FinalCta />
    </>
  );
}
