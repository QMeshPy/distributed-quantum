"use client";

import { Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useOptionsList } from "@/features/options/hooks/use-options-list";
import { OptionsHistoryTable } from "@/features/options/components/options-history-table";

export default function OptionsHistoryPage() {
  const { data, isPending } = useOptionsList();

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Clock}
        label="Options Pricing"
        title="History" glow="amber"
        description="All past quantum options pricing jobs and their results."
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <OptionsHistoryTable jobs={data ?? []} />
        )}
      </div>
    </div>
  );
}
