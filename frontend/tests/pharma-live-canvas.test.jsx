import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { PharmaLiveCanvas } from "../src/features/pharma/components/pharma-live-canvas";

const job = {
  job_id: "pharma-history-test",
  status: "running",
  state: "scoring",
  mode: "optimization",
  target_pdb_id: "1CRN",
  submitted_at: "2026-10-31T00:00:00Z",
  log_lines: [{
    ts: "2026-10-31T00:00:01Z", level: "stage", stage: null,
    message: "fragment decomposition: CCO",
  }],
};
const admetLog = {
  ts: "2026-10-31T00:00:02Z", level: "admet", stage: null, message: "ADMET pass",
};

function render(currentJob) {
  const client = new QueryClient();
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PharmaLiveCanvas job={currentJob} onCancel={() => {}} isCancelling={false} />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

function candidate(smiles, rank) {
  return {
    rank, smiles, scaffold_history: [], descriptors: [],
    vqc_score: { binding_affinity_kcal: -7, confidence_interval: [-8, -6] },
    docking_pose: { total_qubo_energy: -7, qaoa_approximation_ratio: 0.8, dc_qaoa_alpha: 0.5 },
    admet: {
      molecular_weight: 46, logp: 0, tpsa: 20, hbd: 1, hba: 1,
      qed_score: 0.5, synthetic_accessibility: 1, passes: true, failure_reasons: [],
    },
  };
}

test("a live candidate appears in discoveries only after an ADMET pass", () => {
  expect(render(job)).not.toContain("Discovered (");
  expect(render({ ...job, log_lines: [...job.log_lines, admetLog] })).toContain("Discovered (1)");
});

test("completed candidates merge with the observed best candidate and stay capped at 20", () => {
  const completed = {
    ...job,
    status: "completed",
    log_lines: [...job.log_lines, admetLog],
    result: {
      candidates: [candidate("CCO", 1), candidate("CCN", 2)],
      total_runtime_seconds: 2, iterations_used: 1,
    },
  };
  expect(render(completed)).toContain("Discovered (2)");
  completed.result.candidates = Array.from({ length: 23 }, (_, i) => candidate("C".repeat(i + 1), i + 1));
  expect(render(completed)).toContain("Discovered (20)");
});
