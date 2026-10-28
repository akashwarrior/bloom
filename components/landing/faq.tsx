import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Accent, Reveal } from "./section";
import { BRAND } from "./brand";

const faqs = [
  {
    q: "What can I make with Bloom?",
    a: "Landing pages, product sites, portfolios and stores, plus marketing graphics, product visuals and social content, all from a prompt.",
  },
  {
    q: "How is this different from other AI site builders?",
    a: "Bloom does the design thinking before it writes code: it researches references, writes a brief, commits to an art direction, and checks its own work for contrast, hierarchy and generic patterns.",
  },
  {
    q: "Can I edit a design after it renders?",
    a: "Yes. Ask for layout, color, copy or type changes in plain language, and Bloom edits the code while keeping the design system consistent.",
  },
  {
    q: "How do credits work?",
    a: "Each design generation costs 2 credits. Most other tools and edits cost 1 credit per use.",
  },
  {
    q: "Do I need design experience?",
    a: "No. Describe the business and who it's for, and Bloom handles the art direction. If you do have opinions, it listens.",
  },
  {
    q: "Can I use the designs commercially?",
    a: "Yes. Everything you create can be used for client work, products, marketing and other commercial projects.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-340 px-5 pt-32 md:px-10 md:pt-44">
      <div className="grid gap-10 border-t border-line pt-4 md:grid-cols-12 md:gap-8">
        <Reveal className="md:col-span-5">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink/50">
            <span className="text-ink">(02)</span>&nbsp;&nbsp;&nbsp;Questions
          </p>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,5.2vw,4.75rem)] font-medium leading-[0.95] tracking-[-0.045em] text-ink [font-variation-settings:'opsz'_96]">
            Fair <Accent>questions.</Accent>
          </h2>
          <p className="mt-6 max-w-xs text-[15px] leading-relaxed text-ink/60">
            Something else on your mind?{" "}
            <a href={`mailto:hello@${BRAND}`} className="text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-bloom">
              Write to us
            </a>
            .
          </p>
        </Reveal>

        <Reveal className="md:col-span-7" delay={0.08}>
          <Accordion defaultValue={[faqs[0].q]} className="border-t border-line md:border-t-0">
            {faqs.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q} className="border-b border-line">
                <AccordionTrigger className="rounded-none py-6 text-[18px] font-normal tracking-[-0.01em] text-ink hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="max-w-xl pb-6 text-[15.5px] leading-relaxed text-ink/60">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
