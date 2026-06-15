import { Hero } from "@/components/sections/Hero";
import { Advantages } from "@/components/sections/Advantages";
import { Services } from "@/components/sections/Services";
import { Audit } from "@/components/sections/Audit";
import { Trust } from "@/components/sections/Trust";
import { Process } from "@/components/sections/Process";
import { FinalCta } from "@/components/sections/FinalCta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Advantages />
      <Services />
      <Audit />
      <Trust />
      <Process />
      <FinalCta />
    </>
  );
}
