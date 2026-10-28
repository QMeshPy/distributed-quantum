"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SPREADSHEETS } from "@/constants/spreadsheets";
export function OpenSpreadsheet({
  kind,
  runId,
}: {
  kind: "pharma" | "finance" | "circuit";
  runId: string;
}) {
  if (process.env.NEXT_PUBLIC_SPREADSHEETS_ENABLED !== "true") return null;
  return (
    <Button variant="outline" asChild>
      <Link
        href={`${SPREADSHEETS.PATH}?kind=${kind}&run=${encodeURIComponent(runId)}`}
      >
        {SPREADSHEETS.OPEN}
      </Link>
    </Button>
  );
}
