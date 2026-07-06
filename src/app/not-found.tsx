import Link from "next/link";
import { Button } from "@/components/landing-ui/Button";

export default function NotFound() {
  return (
    <section className="section flex min-h-[70vh] items-center">
      <div className="container-x text-center">
        <p className="text-6xl font-bold text-brand">404</p>
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Сторінку не знайдено</h1>
        <p className="mt-3 text-white/60">
          Можливо, посилання застаріло або сторінку переміщено.
        </p>
        <div className="mt-8 flex justify-center">
          <Link href="/">
            <Button size="lg">Повернутися на головну</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
