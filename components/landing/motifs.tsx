import { cn } from "@/lib/utils";

/** Paper grain over a section. Pass `light` on dark or blue grounds. */
export function Grain({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 bg-[url('/grain.svg')] bg-size-[320px]",
        light ? "opacity-[.22] mix-blend-soft-light invert" : "opacity-[.16] mix-blend-multiply",
        className,
      )}
    />
  );
}

/** The outline Bloom's element inspector draws around a selected element. */
export function SelectionFrame({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative outline-[1.5px] outline-offset-[3px] outline-bloom", className)}>
      <span className="absolute -top-[calc(3px+1.35em)] -left-[4.5px] rounded-t-[3px] bg-bloom px-[.55em] py-[.15em] font-mono text-[11px] leading-[1.2] text-bloom-fg">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Accent({ children }: { children: React.ReactNode }) {
  return <em className="font-serif font-normal italic tracking-[-0.02em]">{children}</em>;
}
