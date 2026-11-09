"use client";
import { useRiskForm } from "../hooks/use-risk-form";
import { Controller } from "react-hook-form";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Input } from "@/components/arc/input/input";
import { Button } from "@/components/arc/button/button";
import { Panel, PanelContent, PanelHeader } from "@/shared/components/panel/panel";
import { Select } from "@/components/arc/select/select";
import { cn } from "@/lib/utils";
import type { RiskModel } from "../types";

interface RiskUploadPanelProps {
  className?: string;
}

export function RiskUploadPanel({ className }: RiskUploadPanelProps) {
  const {
    errors,
    fileRef,
    riskModel,
    setRiskModel,
    submit,
    isPending,
    register,
    control,
    useChainlink,
  } = useRiskForm();

  return (
    <Panel className={cn("border-border-subtle bg-surface-muted", className)}>
      <PanelHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Upload Portfolio
        </h2>
        <p className="text-xs text-subtle">
          Upload a CSV with your portfolio holdings to run quantum risk
          analysis.
        </p>
      </PanelHeader>
      <PanelContent className="space-y-4">
        <div className="space-y-1.5">
          <Select
            label="Risk Model"
            value={riskModel}
            onValueChange={(v) => setRiskModel(v as RiskModel)}
            options={[{ value: "equity", label: "Equity VaR" }, { value: "credit", label: "Credit VaR" }]}
          />
        </div>

        <div className="space-y-1.5">
          <FileDropzone accept=".csv" label="Portfolio CSV" description="CSV file" onFilesChange={(files) => { fileRef.current = files[0] ?? null; }} />
          <p className="text-xs text-subtle">
            Equity: columns ticker, weight &nbsp;|&nbsp; Credit: loan_id,
            principal, default_probability, recovery_rate, sensitivity_rho,
            sector
          </p>
        </div>

        {riskModel === "equity" ? (
          <div className="space-y-3">
            <Controller
              control={control}
              name="useChainlink"
              render={({ field }) => (
                <Checkbox
                  label="Value ETH holdings with the live Sepolia ETH/USD feed"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            {useChainlink ? (
              <>
                <p className="text-xs text-subtle">
                  Upload ETH/USD history with only date,close columns (at least
                  five consecutive daily rows). Historical returns determine risk; the feed values
                  your holdings in USD.
                </p>
                <Input label="ETH quantity"
                  id="eth-quantity"
                  type="number"
                  min="0"
                  step="any"
                  {...register("quantity", { valueAsNumber: true })}
                />
                <Input label="Expected ETH price (USD)"
                  id="eth-reference"
                  type="number"
                  min="0"
                  step="any"
                  {...register("expectedEthPrice", { valueAsNumber: true })}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {Object.keys(errors).length > 0 ? (
          <p role="alert" className="text-sm text-danger">
            {errors.root?.message ??
              "Enter positive values for the live valuation fields."}
          </p>
        ) : null}
        <Button onClick={submit} disabled={isPending} className="w-full">
          {isPending ? "Submitting…" : "Run Risk Analysis"}
        </Button>
      </PanelContent>
    </Panel>
  );
}
