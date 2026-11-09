"use client";

import { Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { UserMenu } from "@/components/arc/user-menu/user-menu";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { authClient } from "@/features/auth/hooks/use-auth";
import { ROUTES } from "@/constants";

type UserWithSubscription = {
  id: string;
  name?: string | null;
  email: string;
  hasSubscription?: boolean;
};

export function NavUser() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { theme, setTheme } = useTheme();

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Skeleton lines={2} className="size-7 shrink-0" />
        <Skeleton lines={1} className="h-4 flex-1" />
      </div>
    );
  }

  if (!session?.user) return null;

  const user = session.user as UserWithSubscription;
  const displayName = user.name ?? user.email;
  const isFreeTier = user.hasSubscription === false;

  async function handleSignOut() {
    await authClient.signOut();
    router.push(ROUTES.SIGNIN);
  }

  return (
    <UserMenu
      showName
      align="start"
      user={{ name: displayName, email: user.email, plan: isFreeTier ? "Free tier" : undefined }}
      theme={theme === "light" || theme === "dark" ? theme : "system"}
      onThemeChange={setTheme}
      items={[{ label: "Account settings", icon: <Settings size={14} />, onSelect: () => router.push(ROUTES.SETTINGS) }]}
      onSignOut={handleSignOut}
    />
  );
}
