import { getBilling } from "@/lib/billing.server";
import { requireUserId, route } from "@/lib/http.server";

export const GET = route(async (request) => Response.json(await getBilling(await requireUserId(request))));
