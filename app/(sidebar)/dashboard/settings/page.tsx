"use client";

import { useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { format } from "date-fns";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useBilling } from "@/hooks/use-billing";
import { authClient } from "@/lib/auth-client";
import { PLANS } from "@/lib/billing";
import { preferencesAtom, type Preferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const PREFERENCE_SECTIONS: { title: string; items: { key: keyof Preferences; title: string; description: string }[] }[] = [
  {
    title: "Notifications",
    items: [
      {
        key: "completionSound",
        title: "Play sound when generation completes",
        description: "A subtle chime when your design is ready.",
      },
      {
        key: "completionNotification",
        title: "Show browser notification",
        description: "Get notified even when the tab is in the background.",
      },
    ],
  },
  {
    title: "Labs & Privacy",
    items: [
      { key: "earlyAccess", title: "Early access features", description: "Get early access to experimental features." },
      { key: "productEmails", title: "Email product updates", description: "Occasional notes on new features and improvements." },
      { key: "allowShowcase", title: "Allow designs to be showcased", description: "Lets us feature your best generations." },
      { key: "reduceMotion", title: "Reduce motion", description: "Minimize animations across the dashboard and editor." },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { data } = authClient.useSession();
  const { data: billing } = useBilling();
  const [preferences, setPreferences] = useAtom(preferencesAtom);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = data?.user;

  async function saveProfile(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name || name === user?.name || saving) return;

    setSaving(true);
    try {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(error.message || "Could not save profile");
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function setPreference(key: keyof Preferences, enabled: boolean) {
    if (key === "completionNotification" && enabled) {
      if (!("Notification" in window)) {
        toast.error("This browser does not support notifications");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        toast.error("Allow notifications for Bloom in your browser settings first");
        return;
      }
    }
    setPreferences({ [key]: enabled });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message || "Could not log out");
      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-20">
      <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">Settings</h1>
      {user ? (
        <>
          <section aria-labelledby="profile-heading" className="space-y-6 rounded-xl border p-5">
            <h2 id="profile-heading" className="font-medium">Profile</h2>
            <form onSubmit={saveProfile} className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="profile-name"
                  name="name"
                  autoComplete="name"
                  defaultValue={user.name}
                  required
                  maxLength={80}
                  className="max-w-xs"
                />
                <Button type="submit" disabled={saving || signingOut}>Save name</Button>
              </div>
            </form>
            <div className="space-y-1">
              <p className="text-sm font-medium">Email</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{user.email}</span>
                <Badge variant="secondary">
                  {user.emailVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
            </div>
          </section>

          <SettingsSection title="Plan & Billing">
            <SettingsCard>
              <SettingsItem
                title={billing ? `${PLANS[billing.plan].name} plan` : "Plan"}
                description={billing
                  ? `${billing.credits} credits left. ${PLANS[billing.plan].monthlyCredits} credits a month; ${
                    billing.plan === "FREE" ? "refills" : billing.cancelAtPeriodEnd ? "ends" : "renews"
                  } on ${format(new Date(billing.periodEndsAt), "MMM d")}.`
                  : "Loading your plan…"}
                className="flex-wrap sm:flex-nowrap"
              >
                <Button
                  className="h-9 px-4 rounded-full text-xs font-semibold w-full sm:w-auto"
                  nativeButton={false}
                  render={<Link href="/dashboard/billing" />}
                >
                  {billing?.plan === "FREE" ? "Upgrade plan" : "Manage plan"}
                </Button>
              </SettingsItem>
            </SettingsCard>
          </SettingsSection>

          {PREFERENCE_SECTIONS.map((section) => (
            <SettingsSection key={section.title} title={section.title}>
              <SettingsCard>
                {section.items.map((item) => (
                  <SettingsItem key={item.key} title={item.title} description={item.description}>
                    <Switch
                      aria-label={item.title}
                      checked={preferences[item.key]}
                      onCheckedChange={(checked) => void setPreference(item.key, checked)}
                    />
                  </SettingsItem>
                ))}
              </SettingsCard>
            </SettingsSection>
          ))}

          <Button variant="outline" onClick={signOut} disabled={signingOut || saving}>
            <LogOutIcon />
            Log out
          </Button>
        </>
      ) : (
        <Skeleton className="h-48 w-full rounded-xl" />
      )}
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
