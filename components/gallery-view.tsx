import Link from "next/link";
import { ViewTransition } from "react";
import { ArrowRight } from "lucide-react";
import { SITES, SiteTile } from "@/components/landing/tiles";

function PageTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <ViewTransition name="gallery-view-title">
        <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">{title}</h1>
      </ViewTransition>
      <p className="max-w-xl text-[15px] text-muted-foreground">{description}</p>
    </div>
  );
}

export function GalleryView() {
  return (
    <div className="w-full space-y-8">
      <PageTitle
        title="Showcases"
        description="Seven sentences, seven art directions. Every one of these started as a single prompt."
      />

      <ViewTransition name="gallery-view-items">
        <ul className="grid w-full grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {SITES.map((site) => (
            <li key={site.id} className="group">
              <div className="aspect-[4/5] overflow-hidden rounded-[12px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1">
                <SiteTile site={site} prompt />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
                <p className="truncate text-sm">
                  <span className="font-semibold">{site.name}</span>
                  <span className="text-muted-foreground"> · {site.kind}</span>
                </p>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {site.direction}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </ViewTransition>
    </div>
  );
}

export function EmptyCollection({
  title,
  description,
  empty,
  action,
}: {
  title: string;
  description: string;
  empty: string;
  action: { label: string; href: string };
}) {
  const tiles = [SITES[3], SITES[4], SITES[0]];

  return (
    <div className="w-full space-y-8">
      <PageTitle title={title} description={description} />

      <div className="flex flex-col items-center rounded-[14px] border px-6 py-20 text-center">
        <div className="relative h-36 w-48">
          {tiles.map((site, i) => (
            <div
              key={site.id}
              className="absolute left-1/2 top-0 h-36 w-28 overflow-hidden rounded-[10px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)]"
              style={{ transform: `translateX(calc(-50% + ${(i - 1) * 56}px)) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}
            >
              <SiteTile site={site} />
            </div>
          ))}
        </div>
        <p className="mt-10 font-display text-2xl font-medium tracking-[-0.03em]">{empty}</p>
        <Link
          href={action.href}
          className="group mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-bloom hover:text-white"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
