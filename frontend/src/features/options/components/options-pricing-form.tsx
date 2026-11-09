"use client";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Select } from "@/components/arc/select/select";
import { Panel, PanelContent, PanelHeader } from "@/shared/components/panel/panel";
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
    <Panel className={cn("border-border-subtle bg-surface-muted", className)}>
      <PanelHeader className="pb-4">
        <h2 className="text-base font-medium text-foreground">
          Pricing Parameters
        </h2>
        <p className="text-sm text-subtle">
          Configure the option pricing model parameters.
        </p>
      </PanelHeader>
      <PanelContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Select
              label="Option Type"
              placeholder="Select option type"
              options={(Object.keys(OPTION_TYPE_LABELS) as OptionType[]).map((t) => ({ value: t, label: OPTION_TYPE_LABELS[t] }))}
              onValueChange={(value) => selectOption(value as OptionType)}
            />
            {errors.option_type && (
              <p className="text-xs text-danger">
                {errors.option_type.message}
              </p>
            )}
          </div>

          {supportsFeed ? (
            <div className="space-y-1.5">
              <Checkbox
                label="Use live ETH/USD feed (Sepolia)"
                checked={liveFeed}
                onCheckedChange={(v) => setLiveFeed(v === true)}
              />
              {liveFeed ? (
                <p className="text-xs text-subtle">
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
                <Input label={label}
                  id={name}
                  type="number"
                  step="any"
                  placeholder={placeholder}
                  {...register(name, { valueAsNumber: true })}
                />
                {errors[name] && (
                  <p className="text-xs text-danger">
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
      </PanelContent>
    </Panel>
  );
}
