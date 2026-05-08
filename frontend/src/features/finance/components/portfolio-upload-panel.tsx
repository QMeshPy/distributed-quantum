"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants";
import { usePortfolioUpload } from "../hooks/use-portfolio-upload";

interface PortfolioUploadPanelProps {
  className?: string;
}

export function PortfolioUploadPanel({ className }: PortfolioUploadPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = usePortfolioUpload();

  function handleSubmit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    mutate(file, {
      onSuccess: (data) => {
        router.push(ROUTES.financeDetail(data.job_id));
      },
    });
  }

  return (
    <Card className={cn("border-hairline bg-surface-soft", className)}>
      <CardHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Upload Portfolio
        </h2>
        <p className="text-xs text-muted-foreground">
          Upload a CSV portfolio to run quantum financial optimization.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Accepted format: CSV with columns ticker, weight, value
        </p>
        <Button onClick={handleSubmit} disabled={isPending} className="w-full">
          {isPending ? "Uploading…" : "Submit Portfolio"}
        </Button>
      </CardContent>
    </Card>
  );
}
