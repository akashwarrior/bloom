import Link from "next/link";

import { SITES, SiteTile } from "@/components/showcases/sites";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { Grain, SelectionFrame } from "./motifs";

const strip = [
  { id: "tally", width: "w-[11%]", short: true },
  { id: "hart", width: "w-[17%]" },
  { id: "kiln", width: "w-[9%]", short: true },
  { id: "pantry", width: "w-[19%]", selected: true },
  { id: "nocturne", width: "w-[13%]" },
  { id: "oriel", width: "w-[8%]", short: true },
  { id: "relay", width: "w-[16%]" },
].map((item) => ({ ...item, site: SITES.find((site) => site.id === item.id)! }));

export function Hero({ buildHref }: { buildHref: string }) {
  return (
    <section className="relative overflow-hidden pt-[9.2vw] pb-[5.2vw] text-center max-md:pt-[128px] max-md:pb-[60px]">
      <Grain />

      <h1 className="relative px-[3vw] text-[clamp(52px,7.1vw,144px)] leading-none font-medium tracking-[-0.065em] max-md:px-[15px] max-md:text-[clamp(46px,10vw,70px)] max-md:leading-[1.02] max-md:tracking-[-0.055em]">
        Build web apps by chatting.
      </h1>
      <p className="relative mx-auto mt-[1.9vw] px-5 text-[clamp(18px,1.45vw,28px)] leading-[1.4] tracking-[-0.02em] max-md:mt-[26px] max-md:max-w-[540px]">
        Describe what you want to build. Bloom writes the code,
        <br className="hidden lg:block" /> runs a live preview, and helps you refine it.
      </p>

      <Composer
        id="hero-prompt"
        buildHref={buildHref}
        className="relative mx-auto mt-[2.1vw] w-[39vw] min-w-[550px] max-w-[750px] shadow-none max-md:mt-[30px] max-md:w-[calc(100%-40px)] max-md:min-w-0 max-md:max-w-[550px]"
      />

      <Link
        href="/showcases"
        aria-label="Browse sites built with Bloom"
        className="relative mx-auto mt-[3.4vw] flex h-[13.2vw] w-[96.8%] items-start justify-between gap-[.9vw] max-md:mt-[44px] max-md:h-[136px] max-md:w-[1000px] max-md:ml-[calc((100%-1000px)/2)] max-md:gap-2"
      >
        {strip.map(({ site, width, short, selected }) => {
          const tile = (
            <div className={cn("w-full overflow-hidden", short ? "h-[8.2vw] max-md:h-[84px]" : "h-[13.2vw] max-md:h-[136px]")}>
              <div className="aspect-[4/5] w-full">
                <SiteTile site={site} />
              </div>
            </div>
          );
          return (
            <div key={site.id} className={cn("shrink-0", width)}>
              {selected ? <SelectionFrame label={`${site.name} · ${site.kind}`}>{tile}</SelectionFrame> : tile}
            </div>
          );
        })}
      </Link>
    </section>
  );
}
