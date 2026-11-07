import { z } from "zod";

import { MAX_CREDIT_TOP_UP, MIN_CREDIT_TOP_UP } from "@/lib/billing";
import { buyCredits } from "@/lib/billing.server";
import { parseJson, requireUserId, route } from "@/lib/http.server";

const topUpSchema = z.strictObject({ amount: z.int().min(MIN_CREDIT_TOP_UP).max(MAX_CREDIT_TOP_UP) });

/** Adds credits that never expire. Payment is simulated. */
export const POST = route(async (request) => {
  const userId = await requireUserId(request);
  const { amount } = await parseJson(request, topUpSchema, `Buy between ${MIN_CREDIT_TOP_UP} and ${MAX_CREDIT_TOP_UP} credits`);
  return Response.json(await buyCredits(userId, amount));
});
