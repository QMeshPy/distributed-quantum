import { Plug } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";

const INTEGRATIONS = [
  { name: "Resend", description: "Transactional email for OTP delivery.", status: "connected" },
  { name: "MongoDB Atlas", description: "Primary database for auth and job metadata.", status: "connected" },
  { name: "Backend v2", description: "Quantum compute backend, circuits, options, risk, finance.", status: "connected" },
  { name: "Slack", description: "Alert notifications for job failures.", status: "not configured" },
];

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Plug}
        title="Integrations"
        description="Connected services and external APIs."
      />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        {INTEGRATIONS.map((item) => (
          <Panel key={item.name} className="border-border-subtle">
            <PanelHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <PanelTitle className="text-sm font-medium">{item.name}</PanelTitle>
                <Badge {...legacyBadge(item.status === "connected" ? "default" : "outline")}>
                  {item.status}
                </Badge>
              </div>
            </PanelHeader>
            <PanelContent className="pb-4">
              <p className="text-sm text-subtle">{item.description}</p>
            </PanelContent>
          </Panel>
        ))}
      </div>
    </div>
  );
}
