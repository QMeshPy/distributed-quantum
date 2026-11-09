"use client";
import { usePortfolioForm } from "../hooks/use-portfolio-form";
import { Controller } from "react-hook-form";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Input } from "@/components/arc/input/input";
import { Button } from "@/components/arc/button/button";
import { Panel, PanelContent, PanelHeader } from "@/shared/components/panel/panel";
import { cn } from "@/lib/utils";

interface PortfolioUploadPanelProps {
  className?: string;
}

export function PortfolioUploadPanel({ className }: PortfolioUploadPanelProps) {
  const { errors, fileRef, control, register, useChainlink, submit, isPending } =
    usePortfolioForm();

  return (
    <Panel className={cn("border-border-subtle bg-surface-muted", className)}>
      <PanelHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Upload Portfolio
        </h2>
        <p className="text-xs text-subtle">
          Upload a CSV portfolio to run quantum financial optimization.
        </p>
      </PanelHeader>
      <PanelContent className="space-y-4">
        <FileDropzone accept=".csv" label="Portfolio history CSV" description="CSV file" onFilesChange={(files) => { fileRef.current = files[0] ?? null; }} />
        <p className="text-xs text-subtle">
          Upload daily history with date, ticker, close columns. Use ETH-USD for
          ether.
        </p>
        <Controller
          control={control}
          name="useChainlink"
          render={({ field }) => (
            <Checkbox
              label="Use live prices to calculate quantities"
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
        {useChainlink ? (
          <div className="space-y-2">
            <p className="text-xs text-subtle">
              Historical data selects the assets. The Sepolia ETH/USD feed
              values ETH allocations; other assets are marked unsupported
              without substituting prices.
            </p>
            <Input label="Investment amount (USD)"
              id="investment-usd"
              type="number"
              step="any"
              {...register("investmentUsd", { valueAsNumber: true })}
            />
            <Input label="Expected ETH price (USD)"
              id="expected-eth-price"
              type="number"
              step="any"
              {...register("expectedEthPrice", { valueAsNumber: true })}
            />
          </div>
        ) : null}
        {Object.keys(errors).length > 0 ? (
          <p role="alert" className="text-sm text-danger">
            {errors.root?.message ??
              "Enter positive values for the live valuation fields."}
          </p>
        ) : null}
        <Button onClick={submit} disabled={isPending} className="w-full">
          {isPending ? "Uploading…" : "Submit Portfolio"}
        </Button>
      </PanelContent>
    </Panel>
  );
}
