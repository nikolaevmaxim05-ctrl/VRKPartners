import type { Metadata } from "next";
import { Hero } from "@/components/sections/Hero";
import { Usp } from "@/components/sections/Usp";
import { About } from "@/components/sections/About";
import { Services } from "@/components/sections/Services";
import { Audit } from "@/components/sections/Audit";
import { Trust } from "@/components/sections/Trust";
import { Process } from "@/components/sections/Process";
import { FinalCta } from "@/components/sections/FinalCta";
import { site, siteUrl } from "@/config/site";
import { isSafeImageUrl } from "@/lib/content";
import { getSeoOverrides, mergeSeo, effectiveOg, effectiveOrg } from "@/lib/seo";

// Метадані головної читаються з merged-конфігу (дефолти config/site.ts + оверрайди
// адмінки). robots/canonical/metadataBase лишаються з кореневого layout (інваріанти).
// title.absolute — щоб показати рівно те, що ввів адмін (як у прев'ю сніпета).
export async function generateMetadata(): Promise<Metadata> {
  const m = mergeSeo(await getSeoOverrides());
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
      <About />
      <Services />
      <Audit />
      <Trust />
      <Process />
      <FinalCta />
    </>
  );
}
