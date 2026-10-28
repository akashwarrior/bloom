"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { Accent, Reveal, SectionHeader } from "@/components/landing/section";

const plans = [
  {
    name: "Starter",
    blurb: "For your first few launches.",
    price: { Monthly: 9, Annually: 75 },
    trial: "3-day free trial · 30 credits",
    listLabel: "Includes",
    items: [
      "75 images / month",
      "Website design generations",
      "Graphic design generations",
      "Marketing generations & more",
      "Chat-based refinements",
    ],
  },
  {
    name: "Pro",
    blurb: "For creators shipping every week.",
    price: { Monthly: 25, Annually: 210 },
    trial: "3-day free trial · 40 credits",
    listLabel: "Everything in Starter, plus",
    featured: true,
    items: [
      "200 images / month",
      "Advanced reasoning",
      "Priority rendering queue",
      "Early access features",
    ],
  },
  {
    name: "Max",
    blurb: "For studios and power users.",
    price: { Monthly: 30, Annually: 252 },
    trial: "3-day free trial · 50 credits",
    listLabel: "Everything in Pro, plus",
    items: [
      "400 images / month",
      "Long-context memory",
      "Experimental features",
      "Priority support",
    ],
  },
] as const;

const tabs = [
  { type: "Monthly", label: "Monthly" },
  { type: "Annually", label: "Yearly · save 30%" },
] as const;

type Billing = (typeof tabs)[number]["type"];

export function Plans() {
  const [billing, setBilling] = useState<Billing>("Monthly");

  return (
    <section id="pricing" className="mx-auto max-w-340 px-5 md:px-10">
      <SectionHeader
        index="01"
        label="Pricing"
        title={
          <>
            Less than one hour of a designer&apos;s <Accent>time.</Accent>
          </>
        }
        description="Every plan starts with a three-day free trial. A design generation costs 2 credits; most edits cost 1."
      />

      <Reveal className="mt-14 md:mt-20">
        <div className="flex rounded-full border border-line bg-paper-raised p-1 text-[14px] w-fit">
          <AnimatedBackground
            defaultValue={billing}
            onValueChange={(value) => setBilling(value as Billing)}
            className="rounded-full bg-ink"
          >
            {tabs.map(({ type, label }) => (
              <button
                type="button"
                key={type}
                data-id={type}
                className="px-4 py-2 text-ink/60 transition-colors duration-300 data-checked:text-paper"
              >
                {label}
              </button>
            ))}
          </AnimatedBackground>
        </div>

        <div className="mt-6 grid overflow-hidden rounded-2xl border border-line md:grid-cols-3">
          {plans.map((plan) => {
            const featured = "featured" in plan && plan.featured;
            return (
              <div
                key={plan.name}
                className={cn(
                  "flex flex-col border-line p-7 not-last:border-b md:not-last:border-b-0 md:not-last:border-r lg:p-9",
                  featured ? "bg-ink text-paper" : "bg-paper-raised text-ink",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[17px] font-medium">{plan.name}</h3>
                  {featured && (
                    <span className="rounded-full bg-bloom px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-widest text-bloom-fg">
                      Recommended
                    </span>
                  )}
                </div>
                <p className={cn("mt-1 text-[14px]", featured ? "text-paper/60" : "text-ink/55")}>{plan.blurb}</p>

                <div className="mt-10 flex items-baseline gap-2">
                  <span className="flex font-display text-[64px] font-medium leading-none tracking-tighter [font-variation-settings:'opsz'_96]">
                    <span className="mr-1 mt-2 text-[28px] tracking-normal">$</span>
                    <SlidingNumber value={plan.price[billing]} />
                  </span>
                  <span className={cn("text-[14px]", featured ? "text-paper/55" : "text-ink/50")}>
                    / {billing === "Annually" ? "year" : "month"}
                  </span>
                </div>

                <Link
                  href="/signup"
                  prefetch={false}
                  className={cn(
                    "mt-8 inline-flex h-11 items-center justify-center rounded-full text-[14px] font-medium transition-colors duration-200",
                    featured ? "bg-bloom text-bloom-fg hover:bg-bloom-deep" : "bg-ink text-paper hover:bg-bloom hover:text-bloom-fg",
                  )}
                >
                  Start free trial
                </Link>
                <p className={cn("mt-3 text-center font-mono text-[11px] uppercase tracking-[0.08em]", featured ? "text-paper/45" : "text-ink/40")}>
                  {plan.trial}
                </p>

                <div className={cn("mt-8 border-t pt-6", featured ? "border-white/15" : "border-line")}>
                  <p className={cn("text-[13px]", featured ? "text-paper/55" : "text-ink/50")}>{plan.listLabel}</p>
                  <ul className="mt-4 space-y-3 text-[14.5px]">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <span className={cn("size-1.5 shrink-0 rounded-full", featured ? "bg-bloom" : "bg-ink")} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
