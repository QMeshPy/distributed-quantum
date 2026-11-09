"use client";
import { usePortfolioForm } from "../hooks/use-portfolio-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PortfolioUploadPanelProps {
  className?: string;
}

export function PortfolioUploadPanel({ className }: PortfolioUploadPanelProps) {
  const { errors, fileRef, register, useChainlink, submit, isPending } =
    usePortfolioForm();

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
        <Label htmlFor="finance-history">Portfolio history CSV</Label>
        <input
          id="finance-history"
          ref={fileRef}
          type="file"
          accept=".csv"
          className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Upload daily history with date, ticker, close columns. Use ETH-USD for
          ether.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("useChainlink")} />
          Use live prices to calculate quantities
        </label>
        {useChainlink ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Historical data selects the assets. The Sepolia ETH/USD feed
              values ETH allocations; other assets are marked unsupported
              without substituting prices.
            </p>
            <Label htmlFor="investment-usd">Investment amount (USD)</Label>
            <Input
              id="investment-usd"
              type="number"
              step="any"
              {...register("investmentUsd", { valueAsNumber: true })}
            />
            <Label htmlFor="expected-eth-price">Expected ETH price (USD)</Label>
            <Input
              id="expected-eth-price"
              type="number"
              step="any"
              {...register("expectedEthPrice", { valueAsNumber: true })}
            />
          </div>
        ) : null}
        {Object.keys(errors).length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.root?.message ??
              "Enter positive values for the live valuation fields."}
          </p>
        ) : null}
        <Button onClick={submit} disabled={isPending} className="w-full">
          {isPending ? "Uploading…" : "Submit Portfolio"}
        </Button>
      </CardContent>
    </Card>
  );
}
