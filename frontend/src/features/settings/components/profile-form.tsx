"use client";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="border-hairline">
      <CardHeader>
        <CardTitle className="text-base font-medium">Profile</CardTitle>
        <CardDescription>Update your display name and organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={user?.email ?? ""}
              disabled
              className="bg-muted/50"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input id="profile-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-org">Organization</Label>
            <Input id="profile-org" {...form.register("organization")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-designation">Designation</Label>
            <Input id="profile-designation" {...form.register("designation")} />
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
      </CardContent>
    </Card>
  );
}
