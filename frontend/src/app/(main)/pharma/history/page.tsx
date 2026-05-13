import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { PharmaHistoryTable } from "@/features/pharma/components/pharma-history-table";
import { ROUTES } from "@/constants";

export default function PharmaHistoryPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={FlaskConical}
        label="Pharma"
        title="Job History"
        description="All submitted quantum docking pipelines"
        glow="emerald"
      >
        <Link
          href={ROUTES.PHARMA_SUBMIT}
          className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.05] px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80 shrink-0"
        >
          + New Pipeline
        </Link>
      </PageHeader>
      <div className="flex-1 p-6">
        <PharmaHistoryTable />
      </div>
    </div>
  );
}
