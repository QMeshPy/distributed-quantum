import { Zap } from "lucide-react";
import { UI } from "@/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-surface-soft border border-border">
            <Zap className="text-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground">
            {UI.APP_NAME}
          </h2>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
