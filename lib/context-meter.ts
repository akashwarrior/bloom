import type { DataPart } from "../ai/message/data-part"
import { AGENT_CONTEXT_TOKEN_LIMIT } from "../ai/context/checkpoint.ts"

export function contextMeter(usage?: DataPart["context-usage"]) {
  const limit = usage?.limit ?? AGENT_CONTEXT_TOKEN_LIMIT
  // A step with no provider usage carries only the server's context estimate.
  const used = usage?.breakdown ? usage.used : undefined
  const share = used !== undefined && limit > 0 ? Math.min(1, used / limit) : 0
  const breakdown = usage?.breakdown
  const accounted = breakdown ? breakdown.input + breakdown.cached + breakdown.output + breakdown.reasoning : 0
  // Some providers report tokens in the total without assigning them to these four categories.
  const counts = breakdown && used !== undefined && accounted <= used
    ? { ...breakdown, other: used - accounted }
    : undefined
  return { used, limit, share, counts }
}
