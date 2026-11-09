"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOptionsPricingForm } from "../hooks/use-options-pricing-form";
import type { OptionType } from "../types";

const OPTION_TYPE_LABELS: Record<OptionType, string> = {
  european_call_short: "European Call (Short)",
  european_call_long: "European Call (Long)",
  expand: "Expansion Option",
  delay: "Delay Option",
  abandon: "Abandonment Option",
  patent: "Patent Option",
  natural_resource: "Natural Resource Option",
  financial_flexibility: "Financial Flexibility Option",
};

interface OptionsPricingFormProps {
  className?: string;
}

export function OptionsPricingForm({ className }: OptionsPricingFormProps) {
  const {
    register,
    submit,
    errors,
    isSubmitting,
    liveFeed,
    supportsFeed,
    selectOption,
    setLiveFeed,
  } = useOptionsPricingForm();

  return (
    <Card className={cn("border-hairline bg-surface-soft", className)}>
      <CardHeader className="pb-4">
        <h2 className="text-base font-medium text-foreground">
          Pricing Parameters
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure the option pricing model parameters.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="option_type">Option Type</Label>
            <Select
              onValueChange={(value) => selectOption(value as OptionType)}
            >
              <SelectTrigger id="option_type">
                <SelectValue placeholder="Select option type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(OPTION_TYPE_LABELS) as OptionType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {OPTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.option_type && (
              <p className="text-xs text-destructive">
                {errors.option_type.message}
              </p>
            )}
          </div>

          {supportsFeed ? (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={liveFeed}
                  onChange={(event) => setLiveFeed(event.target.checked)}
                />
                Use live ETH/USD feed (Sepolia)
              </label>
              {liveFeed ? (
                <p className="text-xs text-muted-foreground">
                  Enter the expected USD price below. The run rejects stale
                  prices and deviations above 20%.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                {
                  name: "current_value" as const,
                  label: liveFeed
                    ? "Expected ETH price (USD)"
                    : "Current Value (S)",
                  placeholder: "100",
                },
                {
                  name: "strike_or_cost" as const,
                  label: "Strike / Cost (K)",
                  placeholder: "100",
                },
                {
                  name: "time_to_expiry" as const,
                  label: "Time to Expiry (years)",
                  placeholder: "1",
                },
                {
                  name: "volatility" as const,
                  label: "Volatility (σ)",
                  placeholder: "0.2",
                },
                {
                  name: "risk_free_rate" as const,
                  label: "Risk-Free Rate (r)",
                  placeholder: "0.05",
                },
              ] as const
            ).map(({ name, label, placeholder }) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  type="number"
                  step="any"
                  placeholder={placeholder}
                  {...register(name, { valueAsNumber: true })}
                />
                {errors[name] && (
                  <p className="text-xs text-destructive">
                    {errors[name]?.message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Submitting…" : "Price Option"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
