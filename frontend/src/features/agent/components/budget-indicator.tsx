"use client";

import { useBudgetStatus } from "../hooks/use-budget-status";
import { cn } from "@/lib/utils";

export function BudgetIndicator() {
  const { data: budget } = useBudgetStatus();

  if (!budget) return null;

  const dailyPercent = (budget.daily_spent / budget.daily_limit) * 100;
  const monthlyPercent = (budget.monthly_spent / budget.monthly_limit) * 100;

  const getColorClass = (percent: number) => {
    if (percent > 90) return "bg-red-500";
    if (percent > 70) return "bg-yellow-500";
    return "bg-indigo-500";
  };

  return (
    <div className="p-3 border-b border-white/10">
      <div className="text-xs text-white/40 mb-2">Budget Status</div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Daily</span>
            <span>${budget.daily_spent.toFixed(2)} / ${budget.daily_limit}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                getColorClass(dailyPercent)
              )}
              style={{ width: `${Math.min(dailyPercent, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Monthly</span>
            <span>${budget.monthly_spent.toFixed(2)} / ${budget.monthly_limit}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                getColorClass(monthlyPercent)
              )}
              style={{ width: `${Math.min(monthlyPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
