import { Suspense } from "react";
import { Settings } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { BillingPanel } from "@/features/billing";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Settings}
        label="Settings"
        title="General Settings"
        description="Manage your profile and workspace configuration."
        glow="indigo"
      />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        <ProfileForm />
        <Suspense>
          <BillingPanel />
        </Suspense>
      </div>
    </div>
  );
}
