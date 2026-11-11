import Link from "next/link";
import { CircleArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloomLogo } from "@/components/bloom-logo";
import { buttonVariants } from "@/components/ui/button";
import { SITES, SiteTile } from "@/components/showcases/sites";
import { Grain } from "./motifs";

const collage = ["nocturne", "logo", "hart", "pantry", "relay"] as const;

export function Closing({ buildHref }: { buildHref: string }) {
  return (
    <section className="relative isolate overflow-hidden bg-primary px-5 pt-[3.8vw] pb-[4.2vw] text-center text-primary-foreground max-md:pt-[55px] max-md:pb-[65px]">
      <Grain light />

      <div className="relative z-10">
        <h2 className="text-[clamp(54px,6.8vw,136px)] leading-[.92] font-medium tracking-[-.055em] max-md:text-[clamp(50px,11vw,76px)]">
          Your idea.
          <br />
          Built with Bloom.
        </h2>

        <div
          aria-hidden
          className="mx-auto mt-[3vw] flex aspect-[890/242] w-[47%] items-start gap-[.6vw] max-md:mt-[35px] max-md:w-full max-md:max-w-[560px] max-md:gap-1.5"
        >
          {collage.map((id, index) =>
            id === "logo" ? (
              <div key={id} className="grid aspect-square w-[14%] shrink-0 place-items-center bg-primary-foreground/15">
                <BloomLogo className="size-[70%] text-primary-foreground" />
              </div>
            ) : (
              <div
                key={id}
                className={cn("shrink-0 overflow-hidden", index % 2 ? "h-full w-[24%]" : "h-[82%] w-[19%]")}
              >
                <div className="aspect-[4/5] w-full">
                  <SiteTile site={SITES.find((site) => site.id === id)!} />
                </div>
              </div>
            ),
          )}
        </div>

        <Link
          href={buildHref}
          className={cn(
            buttonVariants({ variant: "link" }),
            "mt-[2.8vw] h-auto gap-[18px] p-0 text-[clamp(42px,6.5vw,130px)] leading-[1.1] font-medium tracking-[-.05em] text-inherit! underline underline-offset-[.15em] decoration-[.035em] hover:underline max-md:mt-[35px] max-md:gap-2.5 max-md:text-[clamp(38px,9vw,62px)]",
          )}
        >
          <CircleArrowRight className="mt-[.13em] size-[.5em] self-start stroke-[1.5]" />
          Start building
        </Link>
      </div>
    </section>
  );
}
