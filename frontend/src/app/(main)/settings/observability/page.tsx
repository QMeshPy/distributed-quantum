import { Activity } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
        label="Settings"
        title="Observability"
        description="Logs, metrics, and tracing signals."
        glow="amber"
      />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        {SIGNALS.map((s) => (
          <Card key={s.name} className="border-hairline">
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{s.name}</CardTitle>
                <Badge variant={s.status === "active" ? "default" : "outline"}>
                  {s.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-xs text-muted-foreground">{s.source}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
