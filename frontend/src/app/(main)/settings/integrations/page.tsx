import { Plug } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const INTEGRATIONS = [
  { name: "Resend", description: "Transactional email for OTP delivery.", status: "connected" },
  { name: "MongoDB Atlas", description: "Primary database for auth and job metadata.", status: "connected" },
  { name: "Backend v2", description: "Quantum compute backend — circuits, options, risk, finance.", status: "connected" },
  { name: "Slack", description: "Alert notifications for job failures.", status: "not configured" },
];

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Plug}
        label="Settings"
        title="Integrations"
        description="Connected services and external APIs."
        glow="cyan"
      />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        {INTEGRATIONS.map((item) => (
          <Card key={item.name} className="border-hairline">
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{item.name}</CardTitle>
                <Badge variant={item.status === "connected" ? "default" : "outline"}>
                  {item.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
