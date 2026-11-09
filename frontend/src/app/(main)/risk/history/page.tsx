"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiskList } from "@/features/risk/hooks/use-risk-list";
import { RiskHistoryTable } from "@/features/risk/components/risk-history-table";

export default function RiskHistoryPage() {
  const { data, isPending } = useRiskList();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-normal text-foreground mb-6">
        Risk History
      </h1>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <RiskHistoryTable jobs={data ?? []} />
      )}
    </div>
  );
}
