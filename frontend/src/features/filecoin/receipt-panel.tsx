"use client";

import { useState } from "react";
import { Download, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  anchorLabel,
  downloadBlob,
  proofLabel,
  requestFilecoin,
  transactionUrl,
} from "./model";
import type {
  FilecoinReceipt,
  StorageStatus,
  VerificationReport,
} from "./model";

export function ReceiptPanel({ receipt }: { receipt: FilecoinReceipt }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [near, setNear] = useState<VerificationReport | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function check(kind: "status" | "verify") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "status")
        setStatus(await requestFilecoin<StorageStatus>(kind, receipt));
      else setNear(await requestFilecoin<VerificationReport>(kind, receipt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification unavailable.");
    } finally {
      setBusy("");
    }
  }
  async function download() {
    setBusy("download");
    setError("");
    try {
      const response = await fetch("/api/filecoin/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receipt),
      });
      if (!response.ok)
        throw new Error(
          "The file could not be retrieved and verified. No download was saved.",
        );
      downloadBlob(
        await response.blob(),
        `qmesh-${receipt.sha256.slice(0, 12)}.bin`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download unavailable.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-labelledby="receipt-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="receipt-heading" className="font-medium">
            Artifact evidence
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {receipt.size_bytes.toLocaleString()} bytes ·{" "}
            {receipt.copies.length} storage{" "}
            {receipt.copies.length === 1 ? "copy" : "copies"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(receipt, null, 2)], {
                type: "application/json",
              }),
              "filecoin-receipt.json",
            )
          }
        >
          <Download />
          Save receipt
        </Button>
      </div>
      <dl className="mt-5 space-y-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Piece CID</dt>
          <dd className="mt-1 break-all font-mono leading-relaxed">
            {receipt.piece_cid}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">SHA256</dt>
          <dd className="mt-1 break-all font-mono text-muted-foreground">
            {receipt.sha256}
          </dd>
        </div>
      </dl>
      <div className="mt-5 divide-y divide-border rounded-lg border border-border">
        <EvidenceLine
          title="Storage registration"
          detail={
            status
              ? status.possession.copies?.every((copy) => copy.registered) &&
                status.possession.copies.length > 0
                ? "Registered on Calibration"
                : "Registration not verified"
              : "Not checked"
          }
        />
        <EvidenceLine
          title="Download integrity"
          detail={
            status
              ? status.retrieval === "verified"
                ? "Downloaded bytes match the receipt"
                : "Unavailable or mismatched"
              : "Not checked"
          }
        />
        <EvidenceLine
          title="Possession proof"
          detail={
            status?.possession.copies?.length
              ? status.possession.copies
                  .map(
                    (copy) =>
                      `Provider ${copy.provider_id}: ${proofLabel(copy)}`,
                  )
                  .join(" · ")
              : "Not checked"
          }
        />
        <EvidenceLine
          title="NEAR provenance"
          detail={
            near ? anchorLabel(near) : "Not checked — experiment packages only"
          }
        />
      </div>
      {status?.possession.observed_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          Observed {new Date(status.possession.observed_at).toLocaleString()}
        </p>
      )}
      {near && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {near.checks.map((check, index) => (
            <li key={`${check.name}-${index}`}>
              <span className="font-medium text-foreground">
                {check.status.replaceAll("_", " ")}
              </span>{" "}
              · {check.name.replaceAll("_", " ")}: {check.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => void check("status")}>
          <ShieldCheck />
          {busy === "status" ? "Checking storage…" : "Check storage"}
        </Button>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => void check("verify")}
        >
          {busy === "verify" ? "Checking NEAR…" : "Check NEAR provenance"}
        </Button>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => void download()}
        >
          <Download />
          {busy === "download"
            ? "Verifying download…"
            : "Download verified file"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {receipt.transaction_hashes.map((hash) => {
          const url = transactionUrl(hash);
          return (
            url && (
              <a
                key={hash}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
              >
                View storage transaction <ExternalLink className="size-3" />
              </a>
            )
          );
        })}
      </div>
    </section>
  );
}

function EvidenceLine({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[150px_1fr]">
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}
