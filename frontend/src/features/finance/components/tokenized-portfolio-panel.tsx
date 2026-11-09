"use client";
import { useTokenizedAssets } from "../hooks/use-tokenized-assets";
import { useTokenizedPortfolioForm } from "../hooks/use-tokenized-portfolio-form";
import { Controller } from "react-hook-form";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Input } from "@/components/arc/input/input";
import { Button } from "@/components/arc/button/button";
import { Panel, PanelContent, PanelHeader } from "@/shared/components/panel/panel";
import { cn } from "@/lib/utils";

export function TokenizedPortfolioPanel({ className }: { className?: string }) {
  const assets = useTokenizedAssets();
  const catalog = assets.data;
  const { errors, register, control, submit, isPending, today } =
    useTokenizedPortfolioForm(catalog);

  return (
    <Panel className={cn("border-border-subtle bg-surface-muted", className)}>
      <PanelHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Robinhood tokenized stocks
        </h2>
        <p className="text-xs text-subtle">
          Optimize a portfolio from on-chain daily token prices. Nothing is
          bought, sold or signed.
        </p>
      </PanelHeader>
      <PanelContent className="space-y-4">
        {assets.isPending ? (
          <p className="text-sm text-subtle">Loading assets…</p>
        ) : !catalog ? (
          <p role="alert" className="text-sm text-danger">
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
                <Controller
                  control={control}
                  name="symbols"
                  render={({ field }) => (
                    <>
                      {catalog.assets.map((asset) => (
                        <Checkbox
                          key={asset.symbol}
                          label={asset.symbol}
                          title={asset.name}
                          checked={field.value.includes(asset.symbol)}
                          onCheckedChange={(on) =>
                            field.onChange(
                              on === true
                                ? [...field.value, asset.symbol]
                                : field.value.filter((s: string) => s !== asset.symbol),
                            )
                          }
                        />
                      ))}
                    </>
                  )}
                />
              </div>
              {errors.symbols ? (
                <p
                  id="tokenized-symbols-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {errors.symbols.message}
                </p>
              ) : null}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Input label="Start date"
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
                    className="text-sm text-danger"
                  >
                    {errors.startDate.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Input label="End date"
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
                    className="text-sm text-danger"
                  >
                    {errors.endDate.message}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-subtle">
              Source: {catalog.data_source}. Daily prices: {catalog.sampling}.
              At least {catalog.min_aligned_days} shared trading days are
              required.
            </p>
            <p className="text-xs text-subtle">{catalog.disclaimer}</p>
            <Button onClick={submit} disabled={isPending} className="w-full">
              {isPending ? "Submitting…" : "Analyze tokenized stocks"}
            </Button>
          </>
        )}
      </PanelContent>
    </Panel>
  );
}
