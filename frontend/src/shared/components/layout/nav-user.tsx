"use client";

import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/features/auth/hooks/use-auth";
import { ROUTES } from "@/constants";

type UserWithSubscription = {
  id: string;
  name?: string | null;
  email: string;
  hasSubscription?: boolean;
};

function getInitials(user: UserWithSubscription): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return user.email[0].toUpperCase();
}

export function NavUser() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <Skeleton className="h-4 flex-1 rounded" />
      </div>
    );
  }

  if (!session?.user) return null;

  const user = session.user as UserWithSubscription;
  const isFreeTier = user.hasSubscription === false;
  const initials = getInitials(user);
  const displayName = user.name ?? user.email;

  async function handleSignOut() {
    await authClient.signOut();
    router.push(ROUTES.SIGNIN);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
        >
          <Avatar size="sm">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">{displayName}</span>
          </div>
          {isFreeTier && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Free tier
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {user.name && (
            <span className="text-sm font-medium">{user.name}</span>
          )}
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>
            <Settings />
            Account settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
