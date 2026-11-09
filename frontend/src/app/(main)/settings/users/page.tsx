import { Users } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
import { Avatar } from "@/components/arc/avatar/avatar";

const PLACEHOLDER_USERS = [
  { email: "soham@quantumgates.io", role: "Owner", initials: "SB" },
];

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Users}
        title="Users"
        description="Team members and workspace permissions."
      />
      <div className="px-6 pb-6">
        <Panel className="border-border-subtle">
          <PanelHeader className="pb-3 pt-5">
            <PanelTitle className="text-sm font-medium">Workspace members</PanelTitle>
          </PanelHeader>
          <PanelContent className="pb-4">
            <ul className="flex flex-col divide-y divide-border-subtle">
              {PLACEHOLDER_USERS.map((u) => (
                <li key={u.email} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm" name={u.email.split("@")[0]} />
                    <p className="text-sm text-foreground">{u.email}</p>
                  </div>
                  <Badge >{u.role}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-subtle">
              Multi-user invite system wired in M13.
            </p>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
