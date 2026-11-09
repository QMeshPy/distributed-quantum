"use client";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/shared/components/panel/panel";
import { authClient } from "@/features/auth/hooks/use-auth";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  organization: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
      organization: (user as Record<string, unknown>)?.organization as string ?? "",
      designation: (user as Record<string, unknown>)?.designation as string ?? "",
    },
  });

  const onSubmit = async (values: ProfileValues) => {
    try {
      await authClient.updateUser({ name: values.name });
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to update profile.");
    }
  };

  return (
    <Panel className="border-border-subtle">
      <PanelHeader>
        <PanelTitle className="text-base font-medium">Profile</PanelTitle>
        <PanelDescription>Update your display name and organization.</PanelDescription>
      </PanelHeader>
      <PanelContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Input label="Email"
              id="profile-email"
              type="email"
              value={user?.email ?? ""}
              disabled
              className="bg-surface-muted/50"
            />
            <p className="text-xs text-subtle">Email cannot be changed.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Input label="Display name" id="profile-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Input label="Organization" id="profile-org" {...form.register("organization")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Input label="Designation" id="profile-designation" {...form.register("designation")} />
          </div>
          <div className="pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </PanelContent>
    </Panel>
  );
}
