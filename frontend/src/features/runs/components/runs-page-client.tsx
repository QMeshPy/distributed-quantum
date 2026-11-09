"use client";

import { FlaskConical, Plus } from "lucide-react";
import { LinkButton } from "@/shared/components/link-button";
import { ROUTES } from "@/constants";
import { PageHeader } from "@/shared/components/layout/page-header";
import { RunsTable } from "./runs-table";

export function RunsPageClient() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={FlaskConical}
        title="All Runs"
        description="Every quantum circuit execution, status, fragments, and results at a glance."
      >
        <LinkButton href={ROUTES.RUNS_NEW} size="sm" className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent">
            <Plus size={14} />
            New Run
          </LinkButton>
      </PageHeader>
      <div className="flex-1 overflow-y-auto p-6">
        <RunsTable />
      </div>
    </div>
  );
}
