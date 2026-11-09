"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UI } from "@/constants";
import { useRunProvenance } from "../hooks/use-run-provenance";
import { safeEvidenceUrl, type VerificationReport } from "../lib/provenance";

const checkNames = new Map<string, string>(Object.entries(UI.PROVENANCE.CHECK_NAMES));

type Props = {
  report?: VerificationReport;
  recorded: boolean;
  loading?: boolean;
  error?: boolean;
  onRefresh?: () => void;
};

export function ProvenanceDetails({ report, recorded, loading, error, onRefresh }: Props) {
  // A stale successful response must not conceal a failed refresh.
  const status = error || loading ? "unverified" : (report?.status ?? "unverified");
  const label = loading ? UI.PROVENANCE.LOADING : status === "verified"
    ? UI.PROVENANCE.VERIFIED : status === "partially_verified"
      ? UI.PROVENANCE.PARTIALLY_VERIFIED : UI.PROVENANCE.UNVERIFIED;
  const kinds = { hash: UI.PROVENANCE.HASH, storage: UI.PROVENANCE.STORAGE, anchor: UI.PROVENANCE.ANCHOR };
  const statuses = {
    passed: UI.PROVENANCE.PASSED, failed: UI.PROVENANCE.FAILED,
    unavailable: UI.PROVENANCE.UNAVAILABLE, not_applicable: UI.PROVENANCE.NOT_APPLICABLE,
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base font-medium">{UI.PROVENANCE.TITLE}</CardTitle>
        <Badge variant={status === "verified" ? "default" : status === "partially_verified" ? "secondary" : "outline"} role="status">
          {label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{UI.PROVENANCE.CAVEAT}</p>
        {!recorded ? <p>{UI.PROVENANCE.EMPTY}</p> : null}
        {error ? <p role="alert">{UI.PROVENANCE.ERROR}</p> : null}
        {report && !error && !loading ? (
          <>
            {status === "partially_verified" ? (
              <p className="text-muted-foreground">{UI.PROVENANCE.LOCAL_ONLY}</p>
            ) : null}
            <ul className="divide-y divide-border">
              {report.checks.map((check, index) => {
                const href = safeEvidenceUrl(check.url);
                return (
                  <li key={`${check.kind}-${check.name}-${index}`} className="space-y-1 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{kinds[check.kind]} · {checkNames.get(check.name) ?? UI.PROVENANCE.OTHER_CHECK}</span>
                      <Badge variant={check.status === "failed" ? "destructive" : "outline"}>
                        {statuses[check.status]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{check.message}</p>
                    {check.reference ? <p className="break-all font-mono text-xs">{check.reference}</p> : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        {UI.PROVENANCE.OPEN_EVIDENCE}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        {recorded && onRefresh ? (
          <Button variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
            {UI.PROVENANCE.REFRESH}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RunProvenance({ bundleId }: { bundleId: string | null }) {
  const query = useRunProvenance(bundleId);
  return (
    <ProvenanceDetails
      recorded={bundleId !== null}
      report={query.data}
      loading={bundleId !== null && query.isFetching}
      error={query.isError}
      onRefresh={() => { void query.refetch(); }}
    />
  );
}
