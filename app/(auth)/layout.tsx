import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Check, Code2 } from "lucide-react";

import { getServerSession } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (await getServerSession()) redirect("/dashboard/projects");
  return (
    <div className="flex min-h-svh bg-muted">
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-5/12 lg:px-10">
        {children}
      </div>
      <aside className="my-4 mr-4 hidden flex-1 flex-col justify-between bg-primary p-[clamp(40px,4.5vw,84px)] text-primary-foreground lg:flex">
        <Code2 className="size-9" strokeWidth={1.3} />
        <div>
          <h2 className="text-[clamp(60px,5.6vw,108px)] leading-[0.98] font-medium tracking-[-0.06em] before:mb-[30px] before:block before:h-1.5 before:w-[38px] before:bg-(--brand-orange) before:content-['']">
            Your idea.
            <br />A working app.
          </h2>
          <p className="mt-[28px] text-[clamp(18px,1.5vw,26px)] leading-[1.4]">
            Build through chat. Preview every change.
            <br />
            Make the details yours.
          </p>
          <div
            className="mt-[46px] grid gap-[50px] rounded-[10px] bg-card p-6 text-base text-foreground"
            aria-hidden="true"
          >
            <span>A project management app for my team</span>
            <span className="flex items-center gap-2.5 text-xs text-primary">
              <Check className="size-4" /> One project. Chat, code and preview.
            </span>
          </div>
        </div>
        <p className="mt-10 border-t border-primary-foreground/30 pt-5 text-[13px]">
          Built with Bloom.
        </p>
      </aside>
    </div>
  );
}
