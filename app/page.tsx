import { Plans } from "@/components/plans";
import {
  Nav,
  Hero,
  Principles,
  Faq,
  Closing,
  Footer,
} from "@/components/landing";
import { getServerSession } from "@/lib/auth";

export default async function LandingPage() {
  const signedIn = Boolean(await getServerSession());
  const buildHref = signedIn ? "/dashboard/projects" : "/signup";

  return (
    <div className="bg-muted">
      <Nav buildHref={buildHref} />

      <main>
        <Hero buildHref={buildHref} />
        <Principles buildHref={buildHref} />
        <Plans buildHref={buildHref} />
        <Faq />
        <Closing buildHref={buildHref} />
      </main>

      <Footer signedIn={signedIn} />
    </div>
  );
}
