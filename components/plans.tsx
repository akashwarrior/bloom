"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const workspaceCards = [
  {
    name: "Project chat",
    heading: "Build",
    description: "Start with a prompt",
    features: [
      "Describe the pages you need",
      "Attach reference images",
      "Try the app in Preview",
      "Ask for changes in chat",
    ],
  },
  {
    name: "Visual editing",
    heading: "Edit",
    description: "Work in the live preview",
    features: [
      "Select an element and edit its text",
      "Adjust spacing and colors",
      "Set project fonts and colors",
    ],
  },
  {
    name: "Project files",
    heading: "Files",
    description: "See the generated code",
    features: [
      "Browse the file tree and open source files",
      "Restore a saved version",
    ],
  },
];

export function Plans({ buildHref }: { buildHref: string }) {
  const [selectedTool, setSelectedTool] = useState(1);

  return (
    <section
      id="pricing"
      className="scroll-mt-[88px] grid grid-cols-[55%_41%] gap-[4%] px-[4.7vw] pt-[6.3vw] pb-[6.1vw] max-md:grid-cols-1 max-md:gap-[35px] max-md:px-[22px] max-md:py-[60px]"
    >
      <div>
        <h2 className="text-[clamp(64px,6.8vw,136px)] leading-[.94] font-medium tracking-[-.06em] max-md:text-[68px]">
          Start a
          <br />
          project
        </h2>
        <p className="mt-[3.7vw] text-[clamp(20px,1.8vw,35px)] leading-[1.16] tracking-[-.025em] max-md:mt-[25px] max-md:text-[23px]">
          Build in chat, then refine your app
          <br />
          in the workspace.
        </p>
      </div>
      <div className="flex flex-col gap-[1.5vw] max-md:gap-[15px]">
        {[workspaceCards[0], workspaceCards[selectedTool]].map((card, index) => (
          <Card
            key={card.name}
            className={cn(
              "gap-0 rounded-none border-0 p-0 shadow-none ring-0",
              index === 1 ? "bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            <CardContent className="grid min-h-[19.5vw] grid-cols-1 items-center gap-6 p-[2.1vw] min-[480px]:grid-cols-2 max-md:min-h-[300px] max-md:gap-[15px] max-md:p-[22px] min-[768px]:grid-cols-1 min-[768px]:gap-7 min-[1100px]:grid-cols-[55%_45%] min-[1100px]:gap-1.5">
              <div className="flex flex-col items-start self-stretch">
                {index === 0 ? (
                  <h3 className="text-[clamp(20px,1.6vw,31px)] leading-[1.1] font-medium tracking-[-.025em] max-md:text-[18px]">
                    {card.name}
                  </h3>
                ) : (
                  <Select
                    modal={false}
                    value={selectedTool}
                    onValueChange={(value) => {
                      if (typeof value === "number") setSelectedTool(value);
                    }}
                  >
                    <SelectTrigger className="h-auto w-auto max-w-full justify-start gap-1 rounded-none border-0 bg-transparent p-0 text-[clamp(20px,1.6vw,31px)] leading-[1.1] font-normal tracking-[-.025em] text-inherit shadow-none focus-visible:ring-0 data-[size=default]:h-auto dark:bg-transparent [&_svg]:text-inherit max-md:whitespace-normal max-md:text-[18px]">
                      <SelectValue className="max-md:line-clamp-none!">
                        {card.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      sideOffset={6}
                    >
                      <SelectGroup>
                        {workspaceCards.slice(1).map((item, toolIndex) => (
                          <SelectItem key={item.name} value={toolIndex + 1}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                <p className="mt-3 text-[clamp(68px,6.6vw,128px)] leading-none tracking-[-.07em] max-md:text-[72px]">
                  {card.heading}
                </p>
                <p className="mt-3 text-[clamp(11px,.85vw,16px)] max-md:max-w-[130px] max-md:text-[11px]">
                  {card.description}
                </p>
                <Link
                  href={buildHref}
                  className={cn(
                    buttonVariants(),
                    "mt-auto h-auto min-h-[34px] rounded-[5px] border-0 px-3.5 py-2 text-[13px] leading-5 font-normal shadow-none hover:bg-bloom-deep max-[1100px]:mt-[25px] max-md:mt-auto max-md:px-[9px] max-md:text-[12px]",
                    index === 1 &&
                      "bg-primary-foreground text-primary hover:bg-card",
                  )}
                >
                  Start building
                </Link>
              </div>
              <div className="text-[clamp(12px,.9vw,18px)] leading-[1.4] max-[1100px]:text-[14px] max-md:text-[13px]">
                <ul className="grid gap-2.5 max-[1100px]:gap-[7px]">
                  {card.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-baseline gap-[9px] max-md:gap-1.5"
                    >
                      <CheckCircle2 className="size-[13px] shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
