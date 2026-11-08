import { route } from "@/lib/http.server";
import { getActiveChatRunId } from "@/lib/project-chat/runs.server";
import { chatUnavailable, resumeChatStream } from "@/lib/project-chat/streams.server";
import { requireProject } from "@/lib/projects/access.server";

export const GET = route(async (request, { params }: RouteContext<"/api/projects/[id]/chat/stream">) => {
  const project = await requireProject(request, (await params).id);
  const run = await getActiveChatRunId(project.id);
  if (!run) return new Response(null, { status: 204 });
  return resumeChatStream(run.id, request.signal).catch(chatUnavailable);
});
