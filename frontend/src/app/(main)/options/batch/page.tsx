"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { useOptionsBatch } from "@/features/options/hooks/use-options-batch";

export default function OptionsBatchPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useOptionsBatch();

  function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    mutate(file);
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-normal text-foreground">Batch Pricing</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        Upload a CSV to price multiple options at once.
      </p>
      <Card className="border-hairline bg-surface-soft">
        <CardHeader className="pb-2">
          <h2 className="text-sm font-medium text-foreground">Upload CSV</h2>
          <p className="text-xs text-muted-foreground">
            Required columns: option_type, current_value, strike_or_cost,
            time_to_expiry, volatility, risk_free_rate
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
          />
          <Button onClick={handleUpload} disabled={isPending}>
            {isPending ? "Uploading…" : "Submit Batch"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
