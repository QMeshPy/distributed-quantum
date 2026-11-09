"use client";

import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { PageHeader } from "@/shared/components/layout/page-header";
import { RunsTable } from "./runs-table";

export function RunsPageClient() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={FlaskConical}
        label="Quantum Runs"
        glow="indigo"
        title="All Runs"
        description="Every quantum circuit execution — status, fragments, and results at a glance."
      >
        <Button asChild size="sm" className="gap-1.5 bg-indigo-500 text-white hover:bg-indigo-400">
          <Link href={ROUTES.RUNS_NEW}>
            <Plus size={14} />
            New Run
          </Link>
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-y-auto p-6">
        <RunsTable />
      </div>
    </div>
  );
}
