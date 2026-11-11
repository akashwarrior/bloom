import { ArrowDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How do I start a project?",
    a: "Create an account, open Projects, and choose New project. Enter a prompt in the project chat to start building.",
    more: "If you start with a prompt on this page, stay in the same tab through sign-up and project creation. Bloom brings the prompt into your new project as a draft.",
  },
  {
    q: "Do I need coding experience?",
    a: "You can start by describing what you need in plain language. Bloom writes the code.",
  },
  {
    q: "Where can I try my app and see its code?",
    a: "Use Preview to try the app and navigate between pages. In Files, select a source file to read its contents.",
  },
  {
    q: "Can I try a different result from an earlier prompt?",
    a: "Edit an earlier message to revise the request, or regenerate Bloom’s response to try the same request again.",
  },
  {
    q: "What can I attach to a message?",
    a: "Attach JPEG, PNG, WebP, or GIF images and plain-text files. You can also paste a written brief into the chat.",
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      className="scroll-mt-[88px] grid grid-cols-[40%_54%] gap-[6%] bg-card px-[4.7vw] py-[8.3vw] max-md:grid-cols-1 max-md:gap-[35px] max-md:px-[22px] max-md:py-[60px]"
    >
      <h2 className="text-[clamp(36px,4.2vw,82px)] leading-[1.02] font-medium tracking-[-0.055em] max-md:text-[40px]">
        Frequently
        <br />
        asked questions
      </h2>

      <Accordion
        defaultValue={[faqs[0].q]}
        className="border-t border-foreground/65"
      >
        {faqs.map((faq) => (
          <AccordionItem
            key={faq.q}
            value={faq.q}
            className="border-b border-foreground/65"
          >
            <AccordionTrigger className="py-[2.25vw] text-[clamp(20px,1.85vw,36px)] leading-[1.2] font-medium tracking-[-.035em] hover:no-underline max-md:py-[25px] max-md:text-[21px] **:data-[slot=accordion-trigger-icon]:hidden">
              {faq.q}
              <span className="size-6 flex items-center justify-center rounded-full border-[.07em] border-current group-aria-expanded/accordion-trigger:-rotate-180 transition-transform duration-75">
                <ArrowDown
                  size={18}
                  strokeWidth={2}
                  className="absolute m-auto"
                />
              </span>
            </AccordionTrigger>

            <AccordionContent className="max-w-[90%] pb-[2.3vw] text-[clamp(15px,1vw,20px)] leading-[1.5] [&_p+p]:mt-[22px] max-md:max-w-[96%] max-md:pb-[25px] max-md:text-[16px]">
              <p>{faq.a}</p>
              {faq.more && <p>{faq.more}</p>}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
