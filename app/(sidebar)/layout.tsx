import Link from "next/link"
import { MenuIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { BloomWordmark } from "@/components/bloom-logo"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function SidebarWrapperLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <div className="w-full bg-background">
        <header className="bg-border/10 h-14 border-b flex items-center justify-between p-6 md:hidden mb-2">
          <Link href="/" prefetch={false}>
            <BloomWordmark />
          </Link>

          <SidebarTrigger>
            <MenuIcon />
          </SidebarTrigger>
        </header>

        <main className="w-full p-4 sm:p-10">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
