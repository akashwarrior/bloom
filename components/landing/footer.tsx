import Link from "next/link";
import { BloomLogo } from "@/components/bloom-logo";
import { BRAND } from "./brand";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Why Bloom", href: "/#why" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Showcases", href: "/showcases" },
    ],
  },
  {
    title: "Make",
    links: [
      { label: "Landing pages", href: "/signup" },
      { label: "Portfolios", href: "/signup" },
      { label: "Online stores", href: "/signup" },
      { label: "Marketing graphics", href: "/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: `mailto:hello@${BRAND}` },
      { label: "Log in", href: "/login" },
      { label: "Sign up", href: "/signup" },
    ],
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto max-w-340 overflow-hidden px-5 pt-24 md:px-10 md:pt-32">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="max-w-xs font-display text-[28px] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
            The AI designer that actually has taste.
          </p>
          <a
            href={`mailto:hello@${BRAND}`}
            className="mt-6 inline-block text-[15px] text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-bloom"
          >
            hello@{BRAND}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/40">{column.title}</p>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} prefetch={false} className="group relative text-ink/75 transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-20 flex flex-col justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink/50 sm:flex-row">
        <span>© {year} Bloom. All rights reserved.</span>
        <span>
          Made by{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://x.com/skyGuptaCS"
            className="text-ink/75 transition-colors hover:text-ink"
          >
            Sky Gupta
          </a>
        </span>
      </div>

      <div className="group/logo mb-[-0.07em] mt-10 flex select-none items-end gap-[0.04em] font-display text-[clamp(6rem,27vw,23rem)] font-semibold leading-[0.8] tracking-[-0.07em] text-ink">
        <BloomLogo animated className="mb-[0.06em] size-[0.72em]" />
        bloom
      </div>
    </footer>
  );
}
