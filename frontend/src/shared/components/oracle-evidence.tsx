import type { OracleProvenance } from "@/shared/types/oracle";

export function OracleEvidence({
  provenance,
}: {
  provenance?: OracleProvenance | null;
}) {
  if (!provenance) return null;
  const workflowPaths = {
    "options-pricing": "options",
    "risk-analysis": "risk",
    "portfolio-optimization": "finance",
  };
  const path = workflowPaths[provenance.bundle.workflow_definition_id];
  const jobId = encodeURIComponent(provenance.bundle.workflow_run_id);
  return (
    <section className="space-y-2 rounded border border-hairline p-4">
      <h3 className="text-sm font-medium">Recorded price evidence</h3>
      {provenance.bundle.oracle_refs.map((reference) => (
        <dl
          key={`${reference.feed}:${reference.round_id}`}
          className="break-all text-xs text-muted-foreground"
        >
          <dt>Feed</dt>
          <dd>{reference.feed}</dd>
          <dt>Price (USD)</dt>
          <dd>{reference.value}</dd>
          <dt>Round</dt>
          <dd>{reference.round_id}</dd>
          <dt>Observed at</dt>
          <dd>{reference.observed_at}</dd>
        </dl>
      ))}
      <a
        className="text-sm underline"
        download="price-provenance.json"
        href={`/api/${path}/${jobId}?download=provenance`}
      >
        Download recorded inputs and provenance
      </a>
      <p className="break-all text-xs text-muted-foreground">
        Provenance hash: {provenance.bundle_hash}
      </p>
    </section>
  );
}
