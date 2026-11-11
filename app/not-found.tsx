import Link from "next/link";
import { Nav } from "@/components/landing/nav";
import { BloomLogo } from "@/components/bloom-logo";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth";

export default async function NotFound() {
  const signedIn = Boolean(await getServerSession());

  return (
    <div className="relative min-h-svh px-6 flex flex-col">
      <Nav buildHref={signedIn ? "/dashboard/projects" : "/signup"} />

      <div className="m-auto flex flex-col items-center justify-center text-center">
        <BloomLogo className="size-14 text-ink motion-safe:animate-[spin_30s_linear_infinite]" />
        <p className="mt-5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink/50">
          Error 404
        </p>

        <h1 className="mt-4 font-display text-[clamp(2.8rem,7vw,4rem)] font-medium leading-[0.92] tracking-[-0.05em]">
          This page never{" "}
          <em className="font-display not-italic text-bloom">bloomed.</em>
        </h1>
        <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/60">
          The link may be old, or the page has moved. Head back and start
          something new.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/" prefetch={false} />}
            className="py-5.5 px-5"
          >
            Back home
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={signedIn ? "/dashboard/projects" : "/login"} prefetch={false} />}
            className="py-5.5 px-5"
          >
            {signedIn ? "Open dashboard" : "Log in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
