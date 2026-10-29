import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await getServerSession())) redirect("/login");
  return children;
}
