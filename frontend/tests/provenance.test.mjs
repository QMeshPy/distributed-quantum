import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProvenanceDetails } from "../src/features/runs/components/run-provenance";
import { safeEvidenceUrl, verificationReportSchema } from "../src/features/runs/lib/provenance";

function report(status) {
  return {
    bundle_id: "bundle-1", status, checked_at: "2026-10-21T00:00:00Z",
    checks: [
      { kind: "hash", name: "bundle_hash", status: status === "unverified" ? "failed" : "passed", message: status === "unverified" ? "Commitment mismatch" : "Commitment matches", reference: null, url: null },
      { kind: "storage", name: "storage_content", status: status === "verified" ? "passed" : "unavailable", message: status === "verified" ? "Retrieved bundle matches" : "No adapter", reference: "fixture-cid", url: "https://example.org/ipfs/fixture-cid" },
      { kind: "anchor", name: "anchor_transaction", status: status === "verified" ? "passed" : "unavailable", message: status === "verified" ? "Confirmed anchor root matches" : "No adapter", reference: "fixture-tx", url: "https://example.org/tx/fixture-tx" },
    ],
  };
}

function render(props) {
  return renderToStaticMarkup(createElement(ProvenanceDetails, props));
}

describe("run provenance", () => {
  test.each([
    ["verified", "Verified"], ["partially_verified", "Partially verified"], ["unverified", "Unverified"],
  ])("renders %s badge", (status, label) => {
    expect(render({ recorded: true, report: report(status) })).toContain(`role="status">${label}`);
  });

  test("renders both storage and anchor links with safe external-link attributes", () => {
    const html = render({ recorded: true, report: report("partially_verified") });
    expect(html).toContain('href="https://example.org/ipfs/fixture-cid"');
    expect(html).toContain('href="https://example.org/tx/fixture-tx"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Unavailable");
  });

  test("missing, loading and error states never claim successful verification", () => {
    expect(render({ recorded: false })).toContain("No provenance bundle recorded");
    const loading = render({ recorded: true, loading: true, report: report("verified") });
    expect(loading).toContain("Checking evidence");
    expect(loading).not.toContain('role="status">Verified');
    const error = render({ recorded: true, error: true, report: report("verified") });
    expect(error).toContain('role="alert"');
    expect(error).toContain('role="status">Unverified');
    expect(error).not.toContain('href=');
  });

  test("rejects executable, credential-bearing and malformed evidence URLs", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.org", "/relative", "invalid"]) {
      expect(safeEvidenceUrl(url)).toBeUndefined();
    }
    const unsafe = report("unverified");
    unsafe.checks[1].url = "javascript:alert(1)";
    expect(render({ recorded: true, report: unsafe })).not.toContain('href="javascript:');
  });

  test("validates the API report rather than trusting an unchecked type cast", () => {
    expect(verificationReportSchema.safeParse(report("partially_verified")).success).toBe(true);
    expect(verificationReportSchema.safeParse({ ...report("verified"), status: "probably_fine" }).success).toBe(false);
  });
});
