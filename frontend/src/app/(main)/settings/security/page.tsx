import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SecurityPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Security</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Authentication and access control settings.</p>
      </div>
      <div className="flex max-w-2xl flex-col gap-4">
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
