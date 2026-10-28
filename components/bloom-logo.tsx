import { cn } from "@/lib/utils";

const PETAL = "M16 15.2C12.4 13.6 9.6 10.9 9.6 7.6a6.4 6.4 0 0 1 12.8 0c0 3.3-2.8 6-6.4 7.6Z";

export function BloomLogo({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-6 text-current", className)}
    >
      <g className={cn(animated && "origin-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/logo:rotate-90")}>
        {[0, 90, 180, 270].map((angle) => (
          <path key={angle} d={PETAL} fill="currentColor" transform={`rotate(${angle} 16 16)`} />
        ))}
      </g>
      <circle cx="16" cy="16" r="2.6" fill="var(--bloom)" />
    </svg>
  );
}

export function BloomWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("group/logo inline-flex items-center gap-2 font-display text-[22px] font-semibold leading-none tracking-[-0.04em]", className)}>
      <BloomLogo animated className="size-[1.1em]" />
      bloom
    </span>
  );
}
