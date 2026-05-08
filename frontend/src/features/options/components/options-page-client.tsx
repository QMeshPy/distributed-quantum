"use client";

import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { OptionsPricingForm } from "./options-pricing-form";

export function OptionsPageClient() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={TrendingUp}
        label="Options Pricing"
        title="Price Options" glow="orange"
        description="Submit a quantum options pricing job. IQAE for quadratic speedup over classical Monte Carlo."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <OptionsPricingForm />
        </div>
      </div>
    </div>
  );
}
