"use client";
import { useRef } from "react";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Button } from "@/components/arc/button/button";
import {
  Panel,
  PanelContent,
  PanelHeader,
} from "@/shared/components/panel/panel";
import { useOptionsBatch } from "@/features/options/hooks/use-options-batch";

export default function OptionsBatchPage() {
  const fileRef = useRef<File | null>(null);
  const { mutate, isPending } = useOptionsBatch();

  function handleUpload() {
    const file = fileRef.current;
    if (!file) return;
    mutate(file);
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-normal text-foreground">Batch Pricing</h1>
      <p className="mt-2 mb-6 text-sm text-subtle">
        Upload a CSV to price multiple options at once.
      </p>
      <Panel className="border-border-subtle bg-surface-muted">
        <PanelHeader className="pb-2">
          <h2 className="text-sm font-medium text-foreground">Upload CSV</h2>
          <p className="text-xs text-subtle">
            Required columns: option_type, current_value, strike_or_cost,
            time_to_expiry, volatility, risk_free_rate
          </p>
        </PanelHeader>
        <PanelContent className="space-y-4">
          <FileDropzone accept=".csv" label="Options CSV" description="CSV file" onFilesChange={(files) => { fileRef.current = files[0] ?? null; }} />
          <Button onClick={handleUpload} disabled={isPending}>
            {isPending ? "Uploading…" : "Submit Batch"}
          </Button>
        </PanelContent>
      </Panel>
    </div>
  );
}
