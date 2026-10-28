"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function BillingPage() {
  const [credits, setCredits] = useState<number>(100);

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-20">
      <div className="mb-10 space-y-2">
        <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">Plans & credits</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription, view usage, and purchase credits.</p>
      </div>

      <div className="space-y-10">
        <BillingSection title="Current plan">
          <BillingCard>
            <CardContent className="space-y-3 border-b p-5 pb-4">
              <h3 className="text-sm font-semibold">Free plan</h3>
              <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                <span>0 credits available</span>
                <span>0 images</span>
              </div>
              <Progress value={10} />
            </CardContent>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-muted-foreground text-xs">0 credits included with this monthly plan</span>
              <Badge variant="secondary" className="text-[11px] h-5 bg-green-50 text-green-700 hover:bg-green-50 border-green-200">
                Free
              </Badge>
            </div>
          </BillingCard>
        </BillingSection>

        <BillingSection title="Upgrade">
          <BillingCard>
            {plans.map((p, idx) => (
              <CardContent
                key={p.name}
                className={cn(
                  "flex flex-col sm:flex-row gap-4 p-5 justify-between items-start sm:items-center",
                  idx < plans.length - 1 && "border-b"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      ${p.price} {p.priceSuffix}
                    </span>
                    <Badge variant="secondary" className="text-[11px] h-5 bg-green-50 text-green-700 hover:bg-green-50 border-green-200">
                      3 days free trial
                    </Badge>
                  </div>
                  <ul className="space-y-1">
                    {p.features.map(f => (
                      <li key={f} className="text-[13px] text-muted-foreground leading-snug flex items-center gap-1.5">
                        <CheckIcon className="size-3 text-green-600 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button className="h-9 px-4 rounded-full text-xs font-semibold shrink-0 gap-1">
                  Upgrade <ArrowRightIcon className="size-3.5" />
                </Button>
              </CardContent>
            ))}
          </BillingCard>
        </BillingSection>

        <BillingSection title="Compare plans">
          <BillingCard className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {[{ name: "Features", price: null }, ...plans].map((p, i) => (
                    <TableHead
                      key={p.name}
                      className={cn(
                        "py-4 px-5 text-[13px]",
                        i === 2 && "bg-bloom-soft/60",
                        i > 0 && "text-center"
                      )}
                    >
                      <div className="space-y-1 font-semibold">
                        <p>{p.name}</p>
                        <p className="text-muted-foreground font-normal">
                          {p.price ? `$${p.price}` : ""}
                        </p>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareRows.map(row => (
                  <TableRow key={row[0]}>
                    {row.map((c, i) => (
                      <TableCell
                        key={`row-${i}`}
                        className={cn(
                          "py-3 px-5 text-[13px]",
                          i === 2 && "bg-bloom-soft/60",
                          i > 0 && "text-center"
                        )}
                      >
                        {c === "Included" ? <CheckIcon className="size-4 text-bloom mx-auto" /> : c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </BillingCard>
        </BillingSection>

        {/* Buy Credits */}
        <BillingSection title="Buy credits">
          <BillingCard>
            <CardContent className="space-y-1.5 p-5 border-b">
              <h3 className="text-sm font-semibold">Top up your credits</h3>
              <p className="text-[13px] text-muted-foreground">
                One-time purchase, $0.07 per credit, no expiry.
              </p>

              <div className="flex items-center gap-2 pt-3 flex-wrap">
                {[100, 200, 500].map(amount => (
                  <Button
                    key={amount}
                    variant={credits === amount ? "default" : "secondary"}
                    className="h-9 px-4 rounded-full text-[13px] font-medium gap-1"
                    onClick={() => setCredits(amount)}
                  >
                    {amount} credits
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground px-1">or</span>
                <Input
                  type="number"
                  className="max-w-36 h-9"
                  onChange={e => setCredits(parseInt(e.target.value, 10) || 0)}
                  placeholder="Custom amount"
                />
              </div>
            </CardContent>

            <CardContent className="flex justify-between items-center p-5">
              <div>
                <p className="text-base font-semibold">
                  ${(credits * 0.07).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  for {credits} credits
                </p>
              </div>
              <Button
                className="h-9 px-4 rounded-full text-[13px] font-semibold gap-1"
                disabled={credits < 50}
              >
                <PlusIcon className="size-3.5" /> Buy credits
              </Button>
            </CardContent>
          </BillingCard>
        </BillingSection>
      </div>
    </div>
  )
}

function BillingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BillingCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-0 gap-0 overflow-hidden ring-0 border border-border/60 shadow-2xs", className)}>
      {children}
    </Card>
  );
}

type Plan = {
  name: string;
  price: number;
  priceSuffix: string;
  ctaColor: string;
  trial: string;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Starter",
    price: 9,
    priceSuffix: "/ mo",
    ctaColor: "bg-secondary text-foreground hover:bg-accent",
    trial: "3-day free trial with 30 credits. Cancel anytime.",
    features: [
      "75 images / month",
      "Website Design generations",
      "Graphic Design generations",
      "Marketing generations & more",
      "Chat-based refinements",
    ],
  },
  {
    name: "Pro",
    price: 25,
    priceSuffix: "/mo",
    ctaColor: "bg-bloom text-white hover:bg-bloom-deep",
    trial: "3-day free trial with 40 credits. Cancel anytime.",
    features: [
      "Everything in Starter, and",
      "200 images / month",
      "Everything in Starter",
      "Advanced Reasoning",
      "Priority rendering queue",
      "Early access features",
    ],
  },
  {
    name: "Max",
    price: 30,
    priceSuffix: "/ first mo",
    ctaColor: "bg-foreground text-background hover:opacity-90",
    trial: "3-day free trial with 50 credits. Cancel anytime.",
    features: [
      "Everything in Pro, and",
      "400 images / month",
      "Everything in Pro",
      "Long-context memory",
      "Experimental features",
      "Priority support",
    ],
  },
];

const compareRows: [string, string, string, string][] = [
  ["Images / month", "75", "200", "400"],
  ["Generation speed", "Standard", "Priority", "Priority"],
  ["Website, Marketing & graphics", "Included", "Included", "Included"],
  ["Chat-based refinements", "Included", "Included", "Included"],
  ["Commercial usage", "Included", "Included", "Included"],
  ["Advanced reasoning", "—", "Included", "Included"],
  ["Rendering queue", "Standard", "Priority", "Priority"],
  ["Context memory", "Standard", "Standard", "Extended"],
  ["Experimental features", "—", "Early access", "Full access"],
];
