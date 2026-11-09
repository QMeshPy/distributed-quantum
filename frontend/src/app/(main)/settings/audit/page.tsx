import { ScrollText } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";

const PLACEHOLDER_EVENTS = [
  { actor: "soham@quantumgates.io", action: "Signed in", resource: "session", ts: "2026-05-05 04:00 UTC" },
  { actor: "soham@quantumgates.io", action: "Submitted circuit run", resource: "run:abc123", ts: "2026-05-04 22:30 UTC" },
  { actor: "soham@quantumgates.io", action: "Submitted options job", resource: "options:xyz789", ts: "2026-05-04 21:15 UTC" },
  { actor: "soham@quantumgates.io", action: "Uploaded risk CSV", resource: "risk:def456", ts: "2026-05-04 19:00 UTC" },
];

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={ScrollText}
        title="Audit Logs"
        description="System-wide audit trail of user actions."
      />
      <div className="px-6 pb-6">
        <Panel className="border-border-subtle">
          <PanelContent className="pt-4 pb-4">
            <ul className="flex flex-col divide-y divide-border-subtle">
              {PLACEHOLDER_EVENTS.map((e, i) => (
                <li key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{e.action}</span>
                      <span className="mx-1.5 text-subtle">·</span>
                      <span className="font-mono text-xs text-subtle">{e.resource}</span>
                    </p>
                    <p className="text-xs text-subtle">{e.actor}</p>
                  </div>
                  <Badge outline className="w-fit shrink-0 font-mono text-xs">
                    {e.ts}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-subtle">
              Live audit log stream from MongoDB wired in M13.
            </p>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
