import { ReactLenis } from "lenis/react";
import { Plans } from "@/components/plans";
import {
  Nav,
  Hero,
  Principles,
  Kinetic,
  Faq,
  Closing,
  Footer,
} from "@/components/landing";

export default function LandingPage() {
  return (
    <ReactLenis root>
      <Nav />

      <main>
        <Hero />
        <Principles />
        <Kinetic />
        <Plans />
        <Faq />
        <Closing />
      </main>

      <Footer />
    </ReactLenis>
  );
}
