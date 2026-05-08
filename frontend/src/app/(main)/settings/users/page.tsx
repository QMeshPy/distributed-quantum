import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const PLACEHOLDER_USERS = [
  { email: "soham@quantumgates.io", role: "Owner", initials: "SB" },
];

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Users</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Team members and workspace permissions.</p>
      </div>
      <Card className="max-w-2xl border-hairline">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-sm font-medium">Workspace members</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ul className="flex flex-col divide-y divide-hairline">
            {PLACEHOLDER_USERS.map((u) => (
              <li key={u.email} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback className="text-[10px]">{u.initials}</AvatarFallback>
                  </Avatar>
                  <p className="text-sm text-foreground">{u.email}</p>
                </div>
                <Badge variant="secondary">{u.role}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Multi-user invite system wired in M13.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
