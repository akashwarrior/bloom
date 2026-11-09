"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { BillingSummary, PaidPlan } from "@/lib/billing";
import { readJsonResponse } from "@/lib/http";

export const billingQueryKey = ["billing"] as const;

export function useBilling() {
  return useQuery({
    queryKey: billingQueryKey,
    queryFn: async ({ signal }) =>
      readJsonResponse<BillingSummary>(await fetch("/api/billing", { signal }), "Failed to load billing"),
  });
}

function useBillingMutation<Input>(request: (input: Input) => Promise<Response>, success: (input: Input) => string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) =>
      readJsonResponse<BillingSummary>(await request(input), "The purchase did not go through"),
    onSuccess: (summary, input) => {
      client.setQueryData(billingQueryKey, summary);
      toast.success(success(input));
    },
    onError: (error) => toast.error(error.message),
  });
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function useSubscribe() {
  return useBillingMutation(
    ({ plan }: { plan: PaidPlan; label: string }) => fetch("/api/billing/subscription", json("POST", { plan })),
    ({ label }) => label,
  );
}

export function useCancelSubscription() {
  return useBillingMutation(
    () => fetch("/api/billing/subscription", json("DELETE")),
    () => "Your plan will end at the close of this billing period",
  );
}

export function useBuyCredits() {
  return useBillingMutation(
    (amount: number) => fetch("/api/billing/credits", json("POST", { amount })),
    (amount) => `Purchase complete. ${amount} credits were added to your account.`,
  );
}
