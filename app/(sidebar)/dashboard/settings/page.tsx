"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2Icon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const { data } = authClient.useSession();

  const user = data?.user || {
    name: "Shadcn",
    email: "Shadcnpro",
    id: "sick",
    image: null,
    emailVerified: true,
  };

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto pb-20">
      <div className="mb-10 space-y-2">
        <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <div className="space-y-10">
        <SettingsSection title="Profile">
          <SettingsCard>
            <SettingsItem
              title="Username"
              description="Unique handle, lowercase letters, numbers, dots, and underscores."
              className="flex-wrap sm:flex-nowrap"
            >
              <Input
                type="text"
                defaultValue={user.name}
                className="sm:max-w-48 h-9"
              />
            </SettingsItem>

            <SettingsItem
              title="Email"
              description="Your account email address."
              className="flex-wrap sm:flex-nowrap"
            >
              <div className="flex items-center gap-2">
                <span className="block text-sm">
                  {user.email}
                </span>

                <Badge variant="secondary" className="text-[11px] bg-green-50 text-green-700">
                  <CheckCircle2Icon />
                  verified
                </Badge>
              </div>
            </SettingsItem>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Plan & Billing">
          <SettingsCard>
            <SettingsItem
              title="Free plan"
              description="5 images/month limit. Upgrade for unlimited generations and faster speeds."
              className="flex-wrap sm:flex-nowrap"
            >
              <Button className="h-9 px-4 rounded-full text-xs font-semibold w-full sm:w-auto">
                Upgrade plan
              </Button>
            </SettingsItem>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsCard>
            <SettingsItem
              title="Play sound when generation completes"
              description="A subtle chime when your design is ready."
            >
              <Switch defaultChecked />
            </SettingsItem>

            <SettingsItem
              title="Show browser notification"
              description="Get notified even when the tab is in the background."
            >
              <Switch />
            </SettingsItem>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Labs & Privacy">
          <SettingsCard>
            <SettingsItem
              title="Early access features"
              description="Get early access to experimental features."
            >
              <Switch />
            </SettingsItem>

            <SettingsItem
              title="Email product updates"
              description="Occasional notes on new features and improvements."
            >
              <Switch defaultChecked />
            </SettingsItem>

            <SettingsItem
              title="Allow designs to be showcased"
              description="Lets us feature your best generations."
            >
              <Switch defaultChecked />
            </SettingsItem>

            <SettingsItem
              title="Reduce motion"
              description="Minimize animations across the dashboard and editor."
            >
              <Switch />
            </SettingsItem>
          </SettingsCard>
        </SettingsSection>

        <div className="pt-6 flex justify-end">
          <Button
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess() {
                    router.push('/');
                  },
                }
              })
            }
            className="rounded-full px-6 h-10 font-medium"
          >
            <LogOutIcon className="size-4 mr-1" />
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-0 gap-0 divide-y overflow-hidden ring-0 border border-border/60 shadow-2xs">
      {children}
    </Card>
  );
}

type SettingsItemProps = {
  title: string;
  description: string;
  children: React.ReactElement;
  className?: string;
};

function SettingsItem({ title, description, children, className }: SettingsItemProps) {
  return (
    <CardContent className={cn("flex p-5 items-start sm:items-center justify-between gap-4", className)}>
      <div className="space-y-1.5 pr-4">
        <h3 className="text-sm font-medium leading-tight">
          {title}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-snug">
          {description}
        </p>
      </div>
      {children}
    </CardContent>
  );
}
