import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/features/landing/components/ui/Button";
import type { SiteMessages } from "@core/domain/content/site-messages";

export async function generateMetadata(): Promise<Metadata> {
  const { thanks } = (await getMessages()) as unknown as SiteMessages;
  return {
    title: thanks.metaTitle,
    // /thanks не индексируется
    robots: { index: false, follow: false },
  };
}

export default async function ThanksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { thanks } = (await getMessages()) as unknown as SiteMessages;
  return (
    <section className="section flex min-h-[70vh] items-center">
      <div className="container-x">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/30">
            <CheckCircle2 className="h-9 w-9 text-brand" />
          </div>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{thanks.title}</h1>
          <p className="mt-4 text-lg text-white/60">{thanks.text}</p>
          <div className="mt-8 flex justify-center">
            <Link href="/">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                {thanks.home}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
