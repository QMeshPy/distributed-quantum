import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent, PanelHeader, PanelTitle, PanelDescription } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";

export default function SecurityPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={ShieldCheck}
        title="Security"
        description="Authentication and access control settings."
      />
      <div className="flex flex-col gap-4 px-6 pb-6">
        <Panel className="border-border-subtle">
          <PanelHeader className="pb-3 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <PanelTitle className="text-sm font-medium">Email OTP</PanelTitle>
                <PanelDescription>Sign in via 6-digit one-time password sent to your email.</PanelDescription>
              </div>
              <Badge>Enabled</Badge>
            </div>
          </PanelHeader>
          <PanelContent className="pb-4">
            <p className="text-sm text-subtle">
              Powered by Better Auth + Resend. OTP expires in 10 minutes, max 3 attempts.
            </p>
          </PanelContent>
        </Panel>
        <Panel className="border-border-subtle">
          <PanelHeader className="pb-3 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <PanelTitle className="text-sm font-medium">Session management</PanelTitle>
                <PanelDescription>Active sessions and token TTL configuration.</PanelDescription>
              </div>
              <Badge outline>7 days TTL</Badge>
            </div>
          </PanelHeader>
          <PanelContent className="pb-4">
            <p className="text-sm text-subtle">
              Sessions stored in MongoDB. Cookie cache: 5 minutes. Sign out revokes all sessions.
            </p>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
