export const PAID_PLANS = ["STARTER", "PRO", "MAX"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type Plan = "FREE" | PaidPlan;

type PlanDetails = {
  name: string;
  priceCents: number;
  priceSuffix: string;
  monthlyCredits: number;
  features: string[];
};

export const PLANS: Record<Plan, PlanDetails> = {
  FREE: {
    name: "Free",
    priceCents: 0,
    priceSuffix: "",
    monthlyCredits: 5,
    features: [],
  },
  STARTER: {
    name: "Starter",
    priceCents: 900,
    priceSuffix: "/ mo",
    monthlyCredits: 75,
    features: [
      "75 credits / month",
      "Website Design generations",
      "Graphic Design generations",
      "Marketing generations & more",
      "Chat-based refinements",
    ],
  },
  PRO: {
    name: "Pro",
    priceCents: 2500,
    priceSuffix: "/mo",
    monthlyCredits: 200,
    features: [
      "Everything in Starter, and",
      "200 credits / month",
      "Advanced Reasoning",
      "Priority rendering queue",
      "Early access features",
    ],
  },
  MAX: {
    name: "Max",
    priceCents: 3000,
    priceSuffix: "/ first mo",
    monthlyCredits: 400,
    features: [
      "Everything in Pro, and",
      "400 credits / month",
      "Long-context memory",
      "Experimental features",
      "Priority support",
    ],
  },
};

export const PLAN_COMPARISON: [string, string, string, string][] = [
  ["Credits / month", "75", "200", "400"],
  ["Generation speed", "Standard", "Priority", "Priority"],
  ["Website, Marketing & graphics", "Included", "Included", "Included"],
  ["Chat-based refinements", "Included", "Included", "Included"],
  ["Commercial usage", "Included", "Included", "Included"],
  ["Advanced reasoning", "—", "Included", "Included"],
  ["Rendering queue", "Standard", "Priority", "Priority"],
  ["Context memory", "Standard", "Standard", "Extended"],
  ["Experimental features", "—", "Early access", "Full access"],
];

export const CREDIT_PRICE_CENTS = 7;
export const CREDIT_TOP_UP_PRESETS = [100, 200, 500] as const;
export const MIN_CREDIT_TOP_UP = 50;
export const MAX_CREDIT_TOP_UP = 10_000;
export const GENERATION_COST = 1;

export type BillingSummary = {
  plan: Plan;
  credits: number;
  monthlyCredits: number;
  usedThisPeriod: number;
  periodStartedAt: string;
  periodEndsAt: string;
  cancelAtPeriodEnd: boolean;
};

export const OUT_OF_CREDITS = "OUT_OF_CREDITS";

export function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
