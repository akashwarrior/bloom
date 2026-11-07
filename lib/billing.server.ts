import "server-only";

import { addMonths } from "date-fns";

import type { BillingAccount, Prisma } from "@/generated/prisma/client";
import {
  CREDIT_PRICE_CENTS,
  GENERATION_COST,
  OUT_OF_CREDITS,
  PLANS,
  type BillingSummary,
  type PaidPlan,
} from "@/lib/billing";
import { HttpError } from "@/lib/http.server";
import prisma from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export class OutOfCreditsError extends HttpError {
  constructor() {
    super(402, "You're out of credits. Upgrade your plan or buy credits to keep building.", {
      code: OUT_OF_CREDITS,
    });
  }
}

/** Loads the account under a row lock, creating it on first use and applying any elapsed billing periods. */
async function lockAccount(tx: Tx, userId: string): Promise<BillingAccount> {
  const now = new Date();
  const created = await tx.billingAccount.createMany({
    data: {
      userId,
      credits: PLANS.FREE.monthlyCredits,
      periodStartedAt: now,
      periodEndsAt: addMonths(now, 1),
    },
    skipDuplicates: true,
  });
  if (created.count) {
    await tx.creditTransaction.create({
      data: { userId, kind: "PLAN", plan: "FREE", amount: PLANS.FREE.monthlyCredits },
    });
  }
  await tx.$queryRaw`SELECT 1 FROM "BillingAccount" WHERE "userId" = ${userId} FOR UPDATE`;
  const account = await tx.billingAccount.findUniqueOrThrow({ where: { userId } });
  return account.periodEndsAt > now ? account : renewElapsedPeriods(tx, account, now);
}

/** Each elapsed period renews the plan, or drops a cancelled plan to Free; Free tops up to its allowance. */
async function renewElapsedPeriods(tx: Tx, account: BillingAccount, now: Date) {
  let { plan, credits, periodStartedAt, periodEndsAt, cancelAtPeriodEnd } = account;
  const grants: Prisma.CreditTransactionCreateManyInput[] = [];
  while (periodEndsAt <= now) {
    if (plan !== "FREE" && cancelAtPeriodEnd) {
      plan = "FREE";
      cancelAtPeriodEnd = false;
    }
    const allowance = PLANS[plan].monthlyCredits;
    const amount = plan === "FREE" ? Math.max(0, allowance - credits) : allowance;
    credits += amount;
    if (amount) {
      grants.push({ userId: account.userId, kind: "PLAN", plan, amount, priceCents: PLANS[plan].priceCents });
    }
    periodStartedAt = periodEndsAt;
    periodEndsAt = addMonths(periodEndsAt, 1);
  }
  if (grants.length) await tx.creditTransaction.createMany({ data: grants });
  return tx.billingAccount.update({
    where: { userId: account.userId },
    data: { plan, credits, periodStartedAt, periodEndsAt, cancelAtPeriodEnd },
  });
}

async function summarize(tx: Tx, account: BillingAccount): Promise<BillingSummary> {
  const used = await tx.creditTransaction.aggregate({
    where: { userId: account.userId, kind: "GENERATION", createdAt: { gte: account.periodStartedAt } },
    _sum: { amount: true },
  });
  return {
    plan: account.plan,
    credits: account.credits,
    monthlyCredits: PLANS[account.plan].monthlyCredits,
    usedThisPeriod: -(used._sum.amount ?? 0),
    periodStartedAt: account.periodStartedAt.toISOString(),
    periodEndsAt: account.periodEndsAt.toISOString(),
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
  };
}

function withAccount(userId: string, change?: (tx: Tx, account: BillingAccount) => Promise<BillingAccount>) {
  return prisma.$transaction(async (tx) => {
    const account = await lockAccount(tx, userId);
    return summarize(tx, change ? await change(tx, account) : account);
  });
}

export function getBilling(userId: string) {
  return withAccount(userId);
}

/**
 * Subscribing to another plan starts a new period with that plan's credits. Subscribing to the
 * current plan resumes it after a cancellation, or otherwise renews it a period ahead.
 */
export function subscribe(userId: string, plan: PaidPlan) {
  return withAccount(userId, async (tx, account) => {
    if (account.plan === plan && account.cancelAtPeriodEnd) {
      return tx.billingAccount.update({ where: { userId }, data: { cancelAtPeriodEnd: false } });
    }
    const { monthlyCredits, priceCents } = PLANS[plan];
    await tx.creditTransaction.create({
      data: { userId, kind: "PLAN", plan, amount: monthlyCredits, priceCents },
    });
    const now = new Date();
    const period = account.plan === plan
      ? { periodEndsAt: addMonths(account.periodEndsAt, 1) }
      : { periodStartedAt: now, periodEndsAt: addMonths(now, 1) };
    return tx.billingAccount.update({
      where: { userId },
      data: { plan, credits: { increment: monthlyCredits }, cancelAtPeriodEnd: false, ...period },
    });
  });
}

/** A paid plan stays active until the period ends, then the account moves to Free. */
export function cancelSubscription(userId: string) {
  return withAccount(userId, async (tx, account) => {
    if (account.plan === "FREE") throw new HttpError(409, "You're on the Free plan.");
    return tx.billingAccount.update({ where: { userId }, data: { cancelAtPeriodEnd: true } });
  });
}

export function buyCredits(userId: string, amount: number) {
  return withAccount(userId, async (tx) => {
    await tx.creditTransaction.create({
      data: { userId, kind: "TOP_UP", amount, priceCents: amount * CREDIT_PRICE_CENTS },
    });
    return tx.billingAccount.update({ where: { userId }, data: { credits: { increment: amount } } });
  });
}

export async function assertCanGenerate(userId: string) {
  const { credits } = await getBilling(userId);
  if (credits < GENERATION_COST) throw new OutOfCreditsError();
}

/** Charges a finished generation once. The balance never goes below zero. */
export async function chargeGeneration(tx: Tx, userId: string, chatRunId: string) {
  const charged = await tx.billingAccount.updateMany({
    where: { userId, credits: { gte: GENERATION_COST } },
    data: { credits: { decrement: GENERATION_COST } },
  });
  if (charged.count) {
    await tx.creditTransaction.create({
      data: { userId, kind: "GENERATION", amount: -GENERATION_COST, chatRunId },
    });
  }
}
