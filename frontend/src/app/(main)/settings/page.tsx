import { ProfileForm } from "@/features/settings/components/profile-form";
import { ApiKeysPanel } from "@/features/settings/components/api-keys-panel";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">General Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your profile and workspace configuration.
        </p>
      </div>
      <div className="flex max-w-2xl flex-col gap-6">
        <ProfileForm />
        <ApiKeysPanel />
      </div>
    </div>
  );
}
