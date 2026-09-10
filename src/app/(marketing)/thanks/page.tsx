import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/features/landing/components/ui/Button";

export const metadata: Metadata = {
  title: "Дякуємо за заявку",
  // /thanks не індексується (див. CLAUDE.md)
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <section className="section flex min-h-[70vh] items-center">
      <div className="container-x">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/30">
            <CheckCircle2 className="h-9 w-9 text-brand" />
          </div>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl">Дякуємо за заявку!</h1>
          <p className="mt-4 text-lg text-white/60">
            Команда VRK Partners отримала ваш запит і зв'яжеться з вами протягом
            робочого дня.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                На головну
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
