"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinanceList } from "@/features/finance/hooks/use-finance-list";
import { FinanceHistoryTable } from "@/features/finance/components/finance-history-table";

export default function FinanceHistoryPage() {
  const { data, isPending } = useFinanceList();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-normal text-foreground mb-6">
        Finance History
      </h1>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <FinanceHistoryTable jobs={data ?? []} />
      )}
    </div>
  );
}
