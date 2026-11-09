import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SecurityPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={ShieldCheck}
        label="Settings"
        title="Security"
        description="Authentication and access control settings."
        glow="emerald"
      />
      <div className="flex flex-col gap-4 px-6 pb-6">
        <Card className="border-hairline">
          <CardHeader className="pb-3 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">Email OTP</CardTitle>
                <CardDescription>Sign in via 6-digit one-time password sent to your email.</CardDescription>
              </div>
              <Badge>Enabled</Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground">
              Powered by Better Auth + Resend. OTP expires in 10 minutes, max 3 attempts.
            </p>
          </CardContent>
        </Card>
        <Card className="border-hairline">
          <CardHeader className="pb-3 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">Session management</CardTitle>
                <CardDescription>Active sessions and token TTL configuration.</CardDescription>
              </div>
              <Badge variant="outline">7 days TTL</Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground">
              Sessions stored in MongoDB. Cookie cache: 5 minutes. Sign out revokes all sessions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
