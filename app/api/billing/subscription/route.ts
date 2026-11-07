import { z } from "zod";

import { PAID_PLANS } from "@/lib/billing";
import { cancelSubscription, subscribe } from "@/lib/billing.server";
import { parseJson, requireUserId, route } from "@/lib/http.server";

const subscribeSchema = z.strictObject({ plan: z.enum(PAID_PLANS) });

/** Subscribes to, switches to, renews or resumes a paid plan. Payment is simulated. */
export const POST = route(async (request) => {
  const userId = await requireUserId(request);
  const { plan } = await parseJson(request, subscribeSchema, "Choose a plan");
  return Response.json(await subscribe(userId, plan));
});

/** Cancels at the end of the current period. */
export const DELETE = route(async (request) => Response.json(await cancelSubscription(await requireUserId(request))));
