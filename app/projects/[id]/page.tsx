import { notFound, redirect } from "next/navigation";

import { ProjectChat } from "@/components/project-chat";
import { getServerSession } from "@/lib/auth";
import { getInitialProjectMessages } from "@/lib/project-chat/messages.server";
import { getOwnedProject } from "@/lib/projects/access.server";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const [session, { id }] = await Promise.all([getServerSession(), params]);

  if (!session) redirect("/login");

  const project = await getOwnedProject(id, session.user.id);
  if (!project) notFound();

  const initialMessages = getInitialProjectMessages(project.id, session.user.id);

  return (
    <ProjectChat
      projectId={project.id}
      projectTitle={project.title}
      initialMessages={initialMessages}
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  );
}
