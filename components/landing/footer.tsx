import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BloomWordmark } from "@/components/bloom-logo";

const columns = [
  { title: "Company", links: [{ label: "Contact us", href: "https://x.com/skyGuptaCS" }] },
  { title: "Product", links: [{ label: "Features", href: "/#why" }, { label: "Design tools", href: "/#design" }, { label: "Get started", href: "/#pricing" }, { label: "How it works", href: "/#workflow" }] },
  { title: "Resources", links: [{ label: "FAQs", href: "/#faq" }, { label: "Showcases", href: "/showcases" }, { label: "Use cases", href: "/#build" }] },
];

export function Footer({ signedIn }: { signedIn: boolean }) {
  const workspaceLinks = signedIn
    ? [
        { label: "Projects", href: "/dashboard/projects" },
        { label: "Settings", href: "/dashboard/settings" },
      ]
    : [
        { label: "Create an account", href: "/signup" },
        { label: "Log in", href: "/login" },
      ];

  return (
    <footer className="bg-card px-[4.7vw] pt-[4.3vw] pb-[3.5vw] max-md:px-[22px] max-md:pt-[45px] max-md:pb-[30px]">
      <div className="grid grid-cols-[2.3fr_1fr_1fr_1fr_1fr] gap-[3.8vw] max-[1100px]:grid-cols-[2fr_1fr_1fr] max-[1100px]:gap-9 max-md:grid-cols-2 max-md:gap-x-5 max-md:gap-y-[35px]">
        <div className="pr-[7vw] max-[1100px]:row-span-2 max-[1100px]:pr-5 max-md:col-span-full max-md:row-auto">
          <Link href="/" aria-label="Bloom home">
            <BloomWordmark />
          </Link>
          <p className="my-[25px] max-w-[475px] text-[clamp(13px,.95vw,18px)] leading-[1.35] max-md:my-5 max-md:max-w-[400px] max-md:text-[15px]">
            Build and refine web apps in one workspace.
          </p>
          <a
            href="https://x.com/skyGuptaCS"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Bloom's creator on X"
            className="hover:underline hover:underline-offset-[3px]"
          >
            𝕏 <ArrowUpRight className="inline size-3" />
          </a>
        </div>
        {[...columns, { title: "Workspace", links: workspaceLinks }].map((column) => (
          <div key={column.title}>
            <h3 className="mb-[22px] text-[14px] font-medium tracking-normal text-muted-foreground max-md:mb-4">
              {column.title}
            </h3>
            <ul className="grid gap-2.5 text-[clamp(13px,.9vw,17px)] max-md:text-[14px]">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="hover:underline hover:underline-offset-[3px]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-[8vw] text-[13px] text-muted-foreground max-md:mt-[55px] max-md:text-[12px]">
        © {new Date().getFullYear()} Bloom. All rights reserved.
      </p>
    </footer>
  );
}
