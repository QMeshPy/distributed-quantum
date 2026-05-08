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
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Observability</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Logs, metrics, and tracing signals.</p>
      </div>
      <div className="grid max-w-2xl grid-cols-1 gap-4">
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
