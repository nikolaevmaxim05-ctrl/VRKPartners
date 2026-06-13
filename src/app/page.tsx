import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { Audit } from "@/components/sections/Audit";
import { Trust } from "@/components/sections/Trust";
import { Process } from "@/components/sections/Process";
import { FinalCta } from "@/components/sections/FinalCta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <Audit />
      <Trust />
      <Process />
      <FinalCta />
    </>
  );
}
