"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { BloomWordmark } from "@/components/bloom-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CreditCardIcon,
  HeartIcon,
  HistoryIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";

const navConfig = {
  main: [
    {
      title: "Workspace",
      items: [
        {
          title: "Projects",
          icon: LayoutGridIcon,
          url: "/dashboard/projects",
        },
        {
          title: "Showcases",
          icon: UsersIcon,
          url: "/showcases",
        },
        {
          title: "Favourites",
          icon: HeartIcon,
          url: "/dashboard/favourites",
        },
        {
          title: "History",
          icon: HistoryIcon,
          url: "/dashboard/history",
        },
      ],
    },
    {
      title: "Account",
      items: [
        {
          title: "Plans & Credits",
          icon: CreditCardIcon,
          url: "/dashboard/billing",
        },
        {
          title: "Settings",
          icon: Settings2Icon,
          url: "/dashboard/settings",
        },
      ],
    },
  ],
  bottom: [
    {
      title: "Follow for updates",
      icon: MessageCircleIcon,
      url: "https://x.com/skyGuptaCS",
    },
  ],
} as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();

  const user = data?.user;
  const isActiveRoute = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/"
              prefetch={false}
              className="inline-flex p-2 text-sidebar-foreground"
            >
              <BloomWordmark />
            </Link>
          </SidebarMenuItem>

          {user && (
            <SidebarMenuItem className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
              <Avatar className="size-6 shrink-0 rounded-sm after:rounded-sm">
                <AvatarFallback className="rounded-sm bg-bloom text-xs font-semibold text-bloom-fg uppercase">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs font-medium">
                {user.name}&apos;s workspace
              </span>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="gap-2">
          {navConfig.main.map((group) => (
            <SidebarMenuItem key={group.title}>
              <p className="px-5 mt-4 pb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {group.title}
              </p>

              <SidebarMenuSub className="ml-0 border-l-0 px-1.5 w-full gap-0">
                {group.items.map((link) => (
                  <SidebarMenuSubItem key={link.title}>
                    <SidebarMenuSubButton
                      isActive={isActiveRoute(link.url)}
                      className="font-medium p-5 rounded-[8px]"
                      render={
                        <Link
                          href={link.url}
                          className="flex items-center justify-start gap-2.5"
                        >
                          <link.icon className="size-4.75!" strokeWidth={1.3} />
                          <span>{link.title}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <SidebarMenu className="mt-auto">
          <SidebarMenuItem>
            <SidebarMenuSub className="ml-0 border-l-0 px-1.5 w-full gap-0">
              {navConfig.bottom.map((link) => (
                <SidebarMenuSubItem key={link.title}>
                  <SidebarMenuSubButton
                    className="font-medium p-5 rounded-[8px]"
                    render={
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-start gap-2.5"
                      >
                        <link.icon className="size-4.75!" strokeWidth={1.3} />
                        <span>{link.title}</span>
                      </a>
                    }
                  />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenuButton
          size="lg"
          className="p-0"
          render={
            !isPending ? (
              <Link
                href={user ? "/dashboard/settings" : "/login"}
                prefetch={false}
                className="size-full"
              />
            ) : undefined
          }
        >
          {isPending ? (
            <div className="flex items-center gap-2 h-12 p-2">
              <Skeleton className="size-8 rounded-full bg-muted-foreground/15" />
              <div className="space-y-2">
                <Skeleton className="h-3.25 w-27 bg-muted-foreground/15" />
                <Skeleton className="h-3 w-37 bg-muted-foreground/15" />
              </div>
            </div>
          ) : user ? (
            <div className="size-full flex items-center justify-center gap-2 p-2">
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg text-sm font-semibold bg-bloom text-bloom-fg">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronRightIcon className="ml-auto size-4" />
            </div>
          ) : (
            <div className="w-full h-10 my-auto flex items-center justify-center gap-1 bg-primary rounded-md text-primary-foreground hover:bg-primary/80 group/login">
              Sign In
              <div className="relative size-4">
                <ChevronRightIcon className="absolute inset-0 opacity-100 group-hover/login:translate-x-0.5 group-hover/login:opacity-0 transition-[opacity,transform]" />
                <ArrowRightIcon className="absolute inset-0 -translate-x-0.5 opacity-0 group-hover/login:opacity-100 group-hover/login:translate-x-0.5 transition-[opacity,transform]" />
              </div>
            </div>
          )}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
