import { Activity } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";

const SIGNALS = [
  { name: "Next.js build logs", source: "Vercel / local", status: "active" },
  { name: "MongoDB Atlas metrics", source: "Atlas dashboard", status: "active" },
  { name: "Backend health endpoint", source: "GET /api/v1/health", status: "active" },
  { name: "Distributed tracing", source: "OpenTelemetry", status: "planned" },
];

export default function ObservabilityPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Activity}
        title="Observability"
        description="Logs, metrics, and tracing signals."
      />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        {SIGNALS.map((s) => (
          <Panel key={s.name} className="border-border-subtle">
            <PanelHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <PanelTitle className="text-sm font-medium">{s.name}</PanelTitle>
                <Badge {...legacyBadge(s.status === "active" ? "default" : "outline")}>
                  {s.status}
                </Badge>
              </div>
            </PanelHeader>
            <PanelContent className="pb-4">
              <p className="text-xs text-subtle">{s.source}</p>
            </PanelContent>
          </Panel>
        ))}
      </div>
    </div>
  );
}
