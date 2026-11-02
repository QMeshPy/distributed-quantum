"use client";
import { useTokenizedAssets } from "../hooks/use-tokenized-assets";
import { useTokenizedPortfolioForm } from "../hooks/use-tokenized-portfolio-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function TokenizedPortfolioPanel({ className }: { className?: string }) {
  const assets = useTokenizedAssets();
  const catalog = assets.data;
  const { errors, register, submit, isPending, today } =
    useTokenizedPortfolioForm(catalog);

  return (
    <Card className={cn("border-hairline bg-surface-soft", className)}>
      <CardHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Robinhood tokenized stocks
        </h2>
        <p className="text-xs text-muted-foreground">
          Optimize a portfolio from on-chain daily token prices. Nothing is
          bought, sold or signed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {assets.isPending ? (
          <p className="text-sm text-muted-foreground">Loading assets…</p>
        ) : !catalog ? (
          <p role="alert" className="text-sm text-destructive">
            {assets.error?.message ?? "Tokenized assets are unavailable"}
          </p>
        ) : (
          <>
            <fieldset
              className="space-y-2"
              aria-invalid={errors.symbols ? true : undefined}
              aria-describedby={errors.symbols ? "tokenized-symbols-error" : undefined}
            >
              <legend className="text-sm font-medium">Assets</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {catalog.assets.map((asset) => (
                  <label
                    key={asset.symbol}
                    className="flex items-center gap-2 text-sm"
                    title={asset.name}
                  >
                    <input
                      type="checkbox"
                      value={asset.symbol}
                      {...register("symbols")}
                    />
                    {asset.symbol}
                  </label>
                ))}
              </div>
              {errors.symbols ? (
                <p
                  id="tokenized-symbols-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.symbols.message}
                </p>
              ) : null}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tokenized-start">Start date</Label>
                <Input
                  id="tokenized-start"
                  type="date"
                  max={today}
                  aria-invalid={errors.startDate ? true : undefined}
                  aria-describedby={errors.startDate ? "tokenized-start-error" : undefined}
                  {...register("startDate")}
                />
                {errors.startDate ? (
                  <p
                    id="tokenized-start-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.startDate.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="tokenized-end">End date</Label>
                <Input
                  id="tokenized-end"
                  type="date"
                  max={today}
                  aria-invalid={errors.endDate ? true : undefined}
                  aria-describedby={errors.endDate ? "tokenized-end-error" : undefined}
                  {...register("endDate")}
                />
                {errors.endDate ? (
                  <p
                    id="tokenized-end-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.endDate.message}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Source: {catalog.data_source}. Daily prices: {catalog.sampling}.
              At least {catalog.min_aligned_days} shared trading days are
              required.
            </p>
            <p className="text-xs text-muted-foreground">{catalog.disclaimer}</p>
            <Button onClick={submit} disabled={isPending} className="w-full">
              {isPending ? "Submitting…" : "Analyze tokenized stocks"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
