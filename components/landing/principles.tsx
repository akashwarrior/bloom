import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloomLogo } from "@/components/bloom-logo";
import { buttonVariants } from "@/components/ui/button";
import { SITES, SiteTile } from "@/components/showcases/sites";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Grain } from "./motifs";

const site = (id: string) => SITES.find((item) => item.id === id)!;

const features = [
  {
    title: "From prompt to working app",
    body: "Describe your idea and Bloom generates the code. Keep building in the same project as your product takes shape.",
  },
  {
    title: "Preview your app and browse its files",
    body: "Switch between the live preview and the Files tab while keeping your conversation in view.",
  },
  {
    title: "Edit the design in the preview",
    body: "Ask for a new look in chat, or select an element in the preview to change its text, spacing or color.",
  },
  {
    title: "Restore a saved version",
    body: "Open Versions to see saved revisions and restore an earlier version of your project.",
  },
  {
    title: "Generate images for your site",
    body: "Ask Bloom to create a hero image or illustration and add it to the page you’re building.",
  },
];

const useCases = [
  {
    id: "web-apps",
    title: "Web apps",
    body: "Start with a recipe browser, a planner, or another interactive app. Describe its screens and what users should be able to do.",
    action: "Build an app",
  },
  {
    id: "websites",
    title: "Websites",
    body: "Create a business site, portfolio or product launch page. Bring your content and make the design your own.",
    action: "Build a website",
  },
  {
    id: "internal-tools",
    title: "Internal tools",
    body: "Build a dashboard or tracker with tables, charts, and filters for the information your team uses.",
    action: "Build a tool",
  },
];

const designTools = [
  {
    title: "Ask for design changes",
    body: "Describe a new layout, a different color palette, or a more focused page and see the result in the preview.",
  },
  {
    title: "Give Bloom a reference",
    body: "Attach a screenshot or share a public website link. Tell Bloom which parts of the style or layout you want to draw from.",
  },
  {
    title: "Edit individual elements",
    body: "Select an element in the preview to change its text or adjust details like spacing and color.",
  },
  {
    title: "Undo any change",
    body: "Step back through your visual edits, or restore a saved version of the whole project from Versions.",
  },
];

const workflow = [
  {
    title: "Iterate in chat",
    body: "Add a feature, change a screen or work through a bug. Keep the context in one conversation as your app evolves.",
  },
  {
    title: "Edit visually",
    body: "Select an element in the live preview and fine-tune the design. Adjust the details without starting over.",
  },
  {
    title: "Browse files and restore versions",
    body: "Open Files to read the generated source, or use Versions to restore a saved revision.",
  },
];

export function Principles({ buildHref }: { buildHref: string }) {
  return (
    <>
      <section
        id="why"
        className="scroll-mt-[88px] grid grid-cols-[41%_53%] gap-[6%] px-[4.7vw] pt-[5.7vw] pb-[9vw] max-[1100px]:grid-cols-[42%_52%] max-md:grid-cols-1 max-md:gap-[46px] max-md:px-[22px] max-md:pt-[30px] max-md:pb-[65px]"
      >
        <div>
          <h2 className="text-[clamp(36px,4.2vw,82px)] leading-[1.02] font-medium tracking-[-0.055em] max-md:text-[38px]">
            Your idea. Real code.
            <br />
            One workspace.
          </h2>
          <p className="mt-6 max-w-[620px] pr-[5vw] text-[clamp(16px,1.25vw,24px)] leading-[1.35] tracking-[-.015em] max-md:mt-5 max-md:max-w-[500px] max-md:pr-0 max-md:text-[17px]">
            Build web apps by talking to AI. Go from a first prompt to a live
            preview, then keep refining the design and implementation in the
            same workspace.
          </p>
          <div
            aria-hidden
            className="mt-[7.5vw] grid aspect-[504/244] w-[65%] grid-cols-[48%_52%] overflow-hidden max-md:mt-[30px] max-md:w-[250px]"
          >
            <div className="relative grid place-items-center bg-primary text-primary-foreground/80">
              <Grain light />
              <BloomLogo className="size-[58%] text-current" />
            </div>
            <div className="relative overflow-hidden border-r-[6px] border-(--brand-orange)">
              <div className="absolute inset-x-0 top-0 aspect-[4/5]">
                <SiteTile site={site("kiln")} />
              </div>
            </div>
          </div>
        </div>

        <Accordion>
          {features.map((feature) => (
            <AccordionItem
              key={feature.title}
              value={feature.title}
              className="[&:first-child_[data-slot=accordion-trigger]]:pt-0"
            >
              <AccordionTrigger className="flex items-center gap-[15px] rounded-none border-0 px-0 py-[1.5vw] text-left text-[clamp(22px,2.55vw,49px)] leading-[1.15] font-medium tracking-[-.045em] no-underline hover:no-underline max-[1100px]:text-[25px] max-md:py-[21px] max-md:text-[24px]">
                {feature.title}
              </AccordionTrigger>
              <AccordionContent className="max-w-[90%] pb-[22px] text-[clamp(15px,1.1vw,21px)] leading-[1.45]">
                {feature.body}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section
        id="build"
        className="scroll-mt-[88px] px-[4.7vw] pb-[4.2vw] max-md:px-[22px] max-md:pb-[30px]"
      >
        <h2 className="text-[clamp(36px,4.2vw,82px)] leading-[1.02] font-medium tracking-[-0.055em] max-md:text-[38px]">
          What will you build first?
        </h2>
        <p className="my-5 text-[clamp(16px,1.2vw,23px)] max-md:my-[14px] max-md:text-[17px]">
          Start with a website, an interactive app, or a dashboard for your team.
        </p>

        <div className="grid grid-cols-3 gap-[1.1vw] max-md:grid-cols-1 max-md:gap-[14px]">
          {useCases.map((item) => (
            <Card
              id={item.id}
              key={item.title}
              className="scroll-mt-[88px] min-h-[27.5vw] rounded-none border-b-[6px] border-(--brand-orange) ring-0 transition-colors hover:bg-(--brand-orange) max-md:min-h-[300px]"
            >
              <CardContent className="flex h-full flex-1 flex-col justify-between gap-[90px] max-md:gap-[60px]">
                <h3 className="text-[clamp(28px,2.65vw,51px)] font-medium tracking-[-.045em] max-md:text-[31px]">
                  {item.title}
                </h3>
                <div>
                  <p className="mb-6 max-w-[95%] text-[clamp(16px,1.25vw,24px)] leading-[1.3] max-md:text-[17px]">
                    {item.body}
                  </p>
                  <Link href={buildHref} className={buttonVariants()}>
                    {item.action}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section
        id="design"
        className="mt-[6vw] grid scroll-mt-[88px] grid-cols-[48%_52%] max-md:mt-[55px] max-md:grid-cols-1"
      >
        <div className="relative min-h-[59.5vw] bg-primary px-[4.7vw] py-[5.7vw] text-primary-foreground max-md:min-h-[600px] max-md:px-6 max-md:py-[50px]">
          <Grain light />

          <h2 className="text-[clamp(60px,6.7vw,132px)] leading-[.94] font-medium tracking-[-.055em] max-md:text-[clamp(62px,19.5vw,76px)]">
            Design
            <br />
            your app
            <br />
            in the
            <br />
            preview.
          </h2>
          <p className="mt-[30px] max-w-[630px] text-[clamp(20px,1.8vw,35px)] leading-[1.2] tracking-[-.02em] max-md:max-w-[430px] max-md:text-[24px]">
            Ask for a new look, select an element, or bring a reference for Bloom to follow.
          </p>
        </div>

        <div className="grid grid-rows-4 py-[4.5vw] pr-[4.7vw] pl-[5.8vw] max-md:p-6">
          {designTools.map((tool) => (
            <Link
              key={tool.title}
              href={buildHref}
              className="group/design-link flex flex-col justify-center border-b border-border py-6 last:border-b-0 max-md:py-7"
            >
              <h3 className="text-[clamp(25px,2.6vw,50px)] leading-[1.04] font-medium tracking-[-.045em] max-md:text-[29px]">
                {tool.title}{" "}
                <span className="ml-[3px] inline-flex size-[.95em] shrink-0 items-center justify-center rounded-full border-[.07em] border-current align-middle">
                  <ArrowRight className="group-hover/design-link:translate-x-1" />
                </span>
              </h3>
              <p className="mt-4 max-w-[95%] text-[clamp(16px,1.22vw,24px)] leading-[1.28] tracking-[-.01em] max-md:text-[17px]">
                {tool.body}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section id="workflow" className="scroll-mt-[88px]">
        <div className="px-[4.7vw] pt-[6.1vw] pb-[4.5vw] max-md:px-[22px] max-md:pt-[45px] max-md:pb-[35px]">
          <p className="mb-[26px] text-[clamp(18px,1.65vw,32px)] max-md:mb-5 max-md:text-lg">
            Keep building after the first prompt
          </p>
          <h3 className="text-[clamp(28px,2.65vw,51px)] leading-[1.05] font-medium tracking-[-.035em] max-md:text-[29px]">
            Add a page or refine a feature.
            <br />
            See the result in the live preview
            <br className="hidden md:block" /> and keep building in the same project.
          </h3>
        </div>

        <div className="relative isolate grid min-h-[35vw] items-center">
          <div
            aria-hidden
            className="absolute inset-0 z-[-1] bg-[radial-gradient(60%_90%_at_15%_20%,color-mix(in_oklab,var(--brand-orange)_70%,transparent),transparent_70%),radial-gradient(55%_80%_at_85%_30%,color-mix(in_oklab,var(--primary)_75%,transparent),transparent_70%),radial-gradient(70%_90%_at_50%_100%,#f4b8d8,transparent_70%)] bg-[#e9e2d6]"
          >
            <Grain />
          </div>
          <div className="mx-auto my-[4.8vw] grid w-[70.5%] grid-cols-3 gap-[1.1vw] max-md:grid-cols-1 max-md:gap-[14px]">
            {workflow.map((item) => (
              <Card key={item.title} className="rounded-none ring-0">
                <CardContent>
                  <h4 className="text-[clamp(23px,1.85vw,36px)] leading-[1.05] font-medium tracking-[-.04em] max-md:text-[28px]">
                    {item.title}
                  </h4>
                  <p className="my-[3.7vw] flex-1 text-[clamp(16px,1.25vw,24px)] leading-[1.28] max-md:my-7 max-md:max-w-[440px] max-md:text-[17px]">
                    {item.body}
                  </p>
                  <Link
                    href={buildHref}
                    aria-label={`${item.title}: start building`}
                    className={cn(
                      buttonVariants({ size: "icon-lg" }),
                      "rounded-full",
                    )}
                  >
                    <ArrowUpRight strokeWidth={2} />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
