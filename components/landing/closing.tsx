"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Accent, Reveal } from "./section";

const SUGGESTIONS = [
  "A natural wine bar in Brooklyn",
  "An AI scribe for family doctors",
  "A climbing gym that feels like a club",
] as const;

export function Closing() {
  const router = useRouter();
  const { data } = authClient.useSession();
  const [value, setValue] = useState("");

  const submit = (event: React.SubmitEvent | React.KeyboardEvent) => {
    event.preventDefault();
    router.push(data?.session ? "/dashboard/projects" : "/signup");
  };


  return (
    <section className="px-3 pt-32 md:px-5 md:pt-44">
      <div className="relative isolate overflow-hidden rounded-[28px] px-5 py-24 md:px-12">
        <Image
          src="/landing/photo3.avif"
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.6)_45%,rgba(255,255,255,0)_80%)]" />

        <div className="grain pointer-events-none absolute inset-0 -z-10 opacity-20 mix-blend-multiply" />

        <div className="mx-auto max-w-295">
          <Reveal>
            <h2 className="max-w-4xl font-display text-[clamp(3rem,8vw,7.5rem)] font-medium leading-[0.9] tracking-[-0.06em] text-ink">
              Start with a <Accent>sentence.</Accent>
              <br />
              <span className="text-ink/45">Ship something beautiful.</span>
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="mt-12 max-w-xl md:mt-16">
            <div className="w-full">
              <form
                onSubmit={submit}
                className={cn(
                  "group relative rounded-2xl border p-2 transition-[border-color,box-shadow] duration-300",
                  "border-ink/15 bg-paper-raised/95 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(19,18,15,0.5)] focus-within:border-ink/40 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--bloom)_14%,transparent),0_24px_48px_-32px_rgba(19,18,15,0.35)]",
                )}
              >
                <label htmlFor="prompt" className="sr-only">
                  Describe the website you want
                </label>
                <textarea
                  id="prompt"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) submit(event);
                  }}
                  placeholder="What are you working on"
                  rows={3}
                  className={cn(
                    "block w-full resize-none bg-transparent px-3 pt-2.5 text-[16px] leading-relaxed outline-none",
                    "text-ink placeholder:text-ink/40",
                  )}
                />
                <div className="flex items-center justify-end gap-3 pl-3 sm:justify-between">
                  <span className={cn("hidden font-mono text-[11px] uppercase tracking-widest sm:inline", "text-ink/40")}>
                    Website · Auto art direction
                  </span>
                  <button
                    type="submit"
                    className={cn(
                      "group/btn inline-flex h-10 shrink-0 items-center whitespace-nowrap gap-2 rounded-xl pl-4 pr-3 text-[14px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
                      "bg-bloom text-bloom-fg hover:bg-bloom-deep focus-visible:outline-bloom",
                    )}
                  >
                    Design it
                    <ArrowUpRight className="size-4 transition-transform duration-300 group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
                  </button>
                </div>
              </form>

              <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                <span className={cn("mr-1 text-[13px]", "text-ink/45")}>Try</span>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setValue(suggestion)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[13px] transition-colors duration-200",
                      "border-ink/12 text-ink/70 hover:border-ink/35 hover:text-ink",
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
