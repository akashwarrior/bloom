"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBilling, useBuyCredits, useCancelSubscription, useSubscribe } from "@/hooks/use-billing";
import {
  CREDIT_PRICE_CENTS,
  CREDIT_TOP_UP_PRESETS,
  formatPrice,
  MAX_CREDIT_TOP_UP,
  MIN_CREDIT_TOP_UP,
  PAID_PLANS,
  PLAN_COMPARISON,
  PLANS,
  type BillingSummary,
  type PaidPlan,
} from "@/lib/billing";
import { cn } from "@/lib/utils";

export default function BillingPage() {
  const { data: billing } = useBilling();

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-20">
      <div className="mb-10 space-y-2">
        <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">Plans & credits</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription, view usage, and purchase credits.</p>
      </div>

      <div className="space-y-10">
        <BillingSection title="Current plan">
          <BillingCard>
            {billing ? <CurrentPlan billing={billing} /> : <Skeleton className="h-27 w-full rounded-none" />}
          </BillingCard>
        </BillingSection>

        <BillingSection title="Upgrade">
          <BillingCard>
            {PAID_PLANS.map((plan, index) => (
              <PlanRow key={plan} plan={plan} billing={billing} last={index === PAID_PLANS.length - 1} />
            ))}
          </BillingCard>
        </BillingSection>

        <BillingSection title="Compare plans">
          <BillingCard className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {[{ name: "Features", priceCents: 0 }, ...PAID_PLANS.map((plan) => PLANS[plan])].map((plan, i) => (
                    <TableHead
                      key={plan.name}
                      className={cn(
                        "py-4 px-5 text-[13px]",
                        i === 2 && "bg-bloom-soft/60",
                        i > 0 && "text-center"
                      )}
                    >
                      <div className="space-y-1 font-semibold">
                        <p>{plan.name}</p>
                        <p className="text-muted-foreground font-normal">
                          {plan.priceCents ? formatPrice(plan.priceCents) : ""}
                        </p>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PLAN_COMPARISON.map((row) => (
                  <TableRow key={row[0]}>
                    {row.map((cell, i) => (
                      <TableCell
                        key={`row-${i}`}
                        className={cn(
                          "py-3 px-5 text-[13px]",
                          i === 2 && "bg-bloom-soft/60",
                          i > 0 && "text-center"
                        )}
                      >
                        {cell === "Included" ? <CheckIcon className="size-4 text-bloom mx-auto" /> : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </BillingCard>
        </BillingSection>

        <BillingSection title="Buy credits">
          <BuyCredits />
        </BillingSection>
      </div>
    </div>
  )
}

function CurrentPlan({ billing }: { billing: BillingSummary }) {
  const cancel = useCancelSubscription();
  const plan = PLANS[billing.plan];
  const periodEnd = format(new Date(billing.periodEndsAt), "MMM d, yyyy");

  return (
    <>
      <CardContent className="space-y-3 border-b p-5 pb-4">
        <h3 className="text-sm font-semibold">{plan.name} plan</h3>
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span>{billing.credits} credits available</span>
          <span>{billing.usedThisPeriod} used this period</span>
        </div>
        <Progress value={Math.min(100, (billing.usedThisPeriod / billing.monthlyCredits) * 100)} />
      </CardContent>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-muted-foreground text-xs">
          {billing.monthlyCredits} credits included with this monthly plan ·{" "}
          {billing.plan === "FREE"
            ? `refills on ${periodEnd}`
            : billing.cancelAtPeriodEnd ? `ends on ${periodEnd}` : `renews on ${periodEnd}`}
        </span>
        <div className="flex items-center gap-2">
          {billing.plan !== "FREE" && !billing.cancelAtPeriodEnd && (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel plan
            </Button>
          )}
          <Badge variant="secondary" className="text-[11px] h-5 bg-green-50 text-green-700 hover:bg-green-50 border-green-200">
            {plan.name}
          </Badge>
        </div>
      </div>
    </>
  );
}

function PlanRow({ plan, billing, last }: { plan: PaidPlan; billing?: BillingSummary; last: boolean }) {
  const subscribe = useSubscribe();
  const details = PLANS[plan];
  const current = billing?.plan === plan;
  const action = !current
    ? { label: "Upgrade", done: `Purchase complete. You're on ${details.name} with ${details.monthlyCredits} new credits.` }
    : billing.cancelAtPeriodEnd
      ? { label: "Resume", done: `Your ${details.name} plan will keep renewing.` }
      : { label: "Renew", done: `Purchase complete. ${details.name} renewed with ${details.monthlyCredits} more credits.` };

  return (
    <CardContent
      className={cn(
        "flex flex-col sm:flex-row gap-4 p-5 justify-between items-start sm:items-center",
        !last && "border-b"
      )}
    >
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-sm font-semibold">{details.name}</h3>
          <span className="text-xs text-muted-foreground">
            {formatPrice(details.priceCents)} {details.priceSuffix}
          </span>
          <Badge variant="secondary" className="text-[11px] h-5 bg-green-50 text-green-700 hover:bg-green-50 border-green-200">
            {current ? "Current plan" : "3 days free trial"}
          </Badge>
        </div>
        <ul className="space-y-1">
          {details.features.map((feature) => (
            <li key={feature} className="text-[13px] text-muted-foreground leading-snug flex items-center gap-1.5">
              <CheckIcon className="size-3 text-green-600 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <Button
        className="h-9 px-4 rounded-full text-xs font-semibold shrink-0 gap-1"
        disabled={!billing || subscribe.isPending}
        onClick={() => subscribe.mutate({ plan, label: action.done })}
      >
        {subscribe.isPending ? <Spinner /> : null}
        {action.label} <ArrowRightIcon className="size-3.5" />
      </Button>
    </CardContent>
  );
}

function BuyCredits() {
  const [credits, setCredits] = useState<number>(CREDIT_TOP_UP_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const buy = useBuyCredits();
  const valid = credits >= MIN_CREDIT_TOP_UP && credits <= MAX_CREDIT_TOP_UP;

  return (
    <BillingCard>
      <CardContent className="space-y-1.5 p-5 border-b">
        <h3 className="text-sm font-semibold">Top up your credits</h3>
        <p className="text-[13px] text-muted-foreground">
          One-time purchase, {formatPrice(CREDIT_PRICE_CENTS)} per credit, no expiry.
        </p>

        <div className="flex items-center gap-2 pt-3 flex-wrap">
          {CREDIT_TOP_UP_PRESETS.map((amount) => (
            <Button
              key={amount}
              variant={credits === amount && !custom ? "default" : "secondary"}
              className="h-9 px-4 rounded-full text-[13px] font-medium gap-1"
              onClick={() => {
                setCustom("");
                setCredits(amount);
              }}
            >
              {amount} credits
            </Button>
          ))}
          <span className="text-xs text-muted-foreground px-1">or</span>
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_CREDIT_TOP_UP}
            max={MAX_CREDIT_TOP_UP}
            aria-label="Custom amount of credits"
            className="max-w-36 h-9"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              setCredits(Number.parseInt(event.target.value, 10) || 0);
            }}
            placeholder="Custom amount"
          />
        </div>
      </CardContent>

      <CardContent className="flex justify-between items-center p-5">
        <div>
          <p className="text-base font-semibold">
            {formatPrice(credits * CREDIT_PRICE_CENTS)}
          </p>
          <p className="text-xs text-muted-foreground">
            {valid ? `for ${credits} credits` : `Choose ${MIN_CREDIT_TOP_UP} to ${MAX_CREDIT_TOP_UP} credits`}
          </p>
        </div>
        <Button
          className="h-9 px-4 rounded-full text-[13px] font-semibold gap-1"
          disabled={!valid || buy.isPending}
          onClick={() => buy.mutate(credits)}
        >
          {buy.isPending ? <Spinner /> : <PlusIcon className="size-3.5" />} Buy credits
        </Button>
      </CardContent>
    </BillingCard>
  );
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
