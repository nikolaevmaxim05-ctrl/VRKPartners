import { Hero } from "@/components/sections/Hero";
import { Usp } from "@/components/sections/Usp";
import { About } from "@/components/sections/About";
import { Services } from "@/components/sections/Services";
import { Audit } from "@/components/sections/Audit";
import { Trust } from "@/components/sections/Trust";
import { Process } from "@/components/sections/Process";
import { FinalCta } from "@/components/sections/FinalCta";

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
