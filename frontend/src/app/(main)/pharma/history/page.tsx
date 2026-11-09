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
        title="Job History"
        description="All submitted quantum docking pipelines"
      >
        <Link
          href={ROUTES.PHARMA_SUBMIT}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm text-subtle transition-colors hover:bg-surface-muted hover:text-foreground shrink-0"
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
