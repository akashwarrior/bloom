import type { ProjectChatMessage } from "@/components/project-chat";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ProjectChat } from "@/components/project-chat";
import { auth } from "@/lib/auth";
import { normalizeReasoningPartsForDisplay } from "@/lib/chat-message";
import prisma from "@/lib/prisma";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

async function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    select: {
      id: true,
      title: true,
    },
  });
}

async function getProjectMessages(
  projectId: string,
  userId: string,
): Promise<ProjectChatMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: {
      projectId,
      project: { userId },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      parts: true,
      metadata: true,
    },
  });

  return messages.map(
    (message) =>
      ({
        id: message.id,
        role: message.role === "USER" ? "user" : "assistant",
        parts: normalizeReasoningPartsForDisplay(
          message.parts as ProjectChatMessage["parts"],
        ),
        ...(message.metadata
          ? { metadata: message.metadata as ProjectChatMessage["metadata"] }
          : {}),
      }) satisfies ProjectChatMessage,
  );
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const [requestHeaders, { id }] = await Promise.all([headers(), params]);
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) redirect("/login");

  const project = await getOwnedProject(id, session.user.id);
  if (!project) notFound();

  const initialMessages = getProjectMessages(project.id, session.user.id);

  return (
    <ProjectChat
      projectId={project.id}
      projectTitle={project.title}
      initialMessages={initialMessages}
      user={{
        name: session.user.name,
        email: session.user.email,
        ...(session.user.image === undefined
          ? {}
          : { image: session.user.image }),
      }}
    />
  );
}
