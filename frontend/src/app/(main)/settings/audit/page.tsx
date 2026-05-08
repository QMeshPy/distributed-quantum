import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLACEHOLDER_EVENTS = [
  { actor: "soham@quantumgates.io", action: "Signed in", resource: "session", ts: "2026-05-05 04:00 UTC" },
  { actor: "soham@quantumgates.io", action: "Submitted circuit run", resource: "run:abc123", ts: "2026-05-04 22:30 UTC" },
  { actor: "soham@quantumgates.io", action: "Submitted options job", resource: "options:xyz789", ts: "2026-05-04 21:15 UTC" },
  { actor: "soham@quantumgates.io", action: "Uploaded risk CSV", resource: "risk:def456", ts: "2026-05-04 19:00 UTC" },
];

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Audit Logs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">System-wide audit trail of user actions.</p>
      </div>
      <Card className="max-w-3xl border-hairline">
        <CardContent className="pt-4 pb-4">
          <ul className="flex flex-col divide-y divide-hairline">
            {PLACEHOLDER_EVENTS.map((e, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{e.action}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="font-mono text-xs text-muted-foreground">{e.resource}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{e.actor}</p>
                </div>
                <Badge variant="outline" className="w-fit shrink-0 font-mono text-[10px]">
                  {e.ts}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Live audit log stream from MongoDB wired in M13.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
