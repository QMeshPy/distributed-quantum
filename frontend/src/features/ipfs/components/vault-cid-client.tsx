"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, HardDrive, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { GlassCard } from "@/shared/components/detail/glass-card";
import { ROUTES, UI } from "@/constants";
import { useCidResolve, type CidResolveError } from "../hooks/use-cid-resolve";
import type { ResolveVaultCidResult } from "../lib/cid-resolve";
import type { CircuitIpfsRecord, RunIpfsRecord } from "../schemas/vault-record.schema";

const pasteSchema = z.object({
  cid: z.string().min(1, UI.VAULT_CID.PASTE_REQUIRED),
});

type PasteValues = z.infer<typeof pasteSchema>;

interface VaultCidClientProps {
  /** Route param; empty string means paste-only landing. */
  cid: string;
}

function errorCopy(error: CidResolveError): { title: string; body: string } {
  switch (error.code) {
    case "INVALID_CID":
      return { title: UI.VAULT_CID.ERR_INVALID_TITLE, body: UI.VAULT_CID.ERR_INVALID_BODY };
    case "GATEWAY_UNREACHABLE":
      return {
        title: UI.VAULT_CID.ERR_GATEWAY_TITLE,
        body: UI.VAULT_CID.ERR_GATEWAY_BODY,
      };
    case "CID_MISMATCH":
      return {
        title: UI.VAULT_CID.ERR_MISMATCH_TITLE,
        body: UI.VAULT_CID.ERR_MISMATCH_BODY,
      };
    case "SCHEMA_INVALID":
      return {
        title: UI.VAULT_CID.ERR_SCHEMA_TITLE,
        body: error.message || UI.VAULT_CID.ERR_SCHEMA_BODY,
      };
    case "HELIA_NOT_READY":
      return { title: UI.VAULT_CID.ERR_HELIA_TITLE, body: error.message };
    default:
      return { title: UI.VAULT_CID.ERR_UNKNOWN_TITLE, body: error.message };
  }
}

export function VaultCidClient({ cid }: VaultCidClientProps) {
  const router = useRouter();
  const { resolve, resolving, error, result, ready } = useCidResolve();
  const [activeCid, setActiveCid] = useState(cid);

  const form = useForm<PasteValues>({
    resolver: zodResolver(pasteSchema),
    defaultValues: { cid: cid || "" },
  });

  useEffect(() => {
    setActiveCid(cid);
    form.reset({ cid: cid || "" });
    // form.reset is stable; only re-sync when the route CID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => {
    if (!ready || !activeCid) return;
    void resolve(activeCid);
  }, [ready, activeCid, resolve]);

  const onPaste = form.handleSubmit((values) => {
    const next = values.cid.trim();
    router.push(ROUTES.vaultCid(next));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        label="Vault"
        title={UI.VAULT_CID.TITLE}
        description={UI.VAULT_CID.DESCRIPTION}
        glow="orange"
      />

      <GlassCard>
        <form onSubmit={onPaste} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="vault-cid-paste" className="text-xs font-medium text-muted-foreground">
              {UI.VAULT_CID.PASTE_LABEL}
            </label>
            <Input
              id="vault-cid-paste"
              placeholder={UI.VAULT_CID.PASTE_PLACEHOLDER}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(form.formState.errors.cid)}
              {...form.register("cid")}
            />
            {form.formState.errors.cid ? (
              <p className="text-xs text-destructive">{form.formState.errors.cid.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{UI.VAULT_CID.PRIVACY_NOTE}</p>
            )}
          </div>
          <Button type="submit" className="shrink-0">
            <Link2 className="size-4" />
            {UI.VAULT_CID.OPEN_CTA}
          </Button>
        </form>
      </GlassCard>

      {!activeCid ? (
        <p className="text-sm text-muted-foreground">{UI.VAULT_CID.EMPTY_HINT}</p>
      ) : resolving || !ready ? (
        <CidSkeleton />
      ) : error ? (
        <ErrorPanel error={error} cid={activeCid} />
      ) : result ? (
        <ResolvedRecord result={result} />
      ) : null}
    </div>
  );
}

function ErrorPanel({ error, cid }: { error: CidResolveError; cid: string }) {
  const copy = errorCopy(error);
  return (
    <GlassCard>
      <div className="flex flex-col gap-2 py-4 text-center">
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <p className="text-xs text-muted-foreground">{copy.body}</p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{cid}</p>
      </div>
    </GlassCard>
  );
}

function VerifiedBadge({ source }: { source: "local" | "gateway" }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-success-border/40 bg-success/5 px-2 py-1 text-xs text-success">
      <CheckCircle2 className="size-3.5" aria-hidden />
      <span>
        {UI.VAULT_CID.VERIFIED}
        {source === "gateway" ? ` · ${UI.VAULT_CID.SOURCE_GATEWAY}` : ` · ${UI.VAULT_CID.SOURCE_LOCAL}`}
      </span>
    </div>
  );
}

function ResolvedRecord({ result }: { result: ResolveVaultCidResult }) {
  if (result.kind === "circuit") {
    const circuit = result.record as CircuitIpfsRecord;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">{circuit.name}</h2>
            <p className="text-xs text-muted-foreground">
              {circuit.description || UI.VAULT_CID.NO_DESCRIPTION}
            </p>
          </div>
          <VerifiedBadge source={result.source} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassCard>
            <p className="text-xs text-muted-foreground">Qubits</p>
            <p className="text-lg font-medium">{circuit.qubitCount}</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs text-muted-foreground">Gates</p>
            <p className="text-lg font-medium">{circuit.gateCount}</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs text-muted-foreground">Author</p>
            <p className="text-lg font-medium">{circuit.author}</p>
          </GlassCard>
        </div>
        {circuit.qasm ? (
          <GlassCard>
            <p className="mb-2 text-xs font-medium text-muted-foreground">QASM</p>
            <pre className="overflow-auto rounded bg-muted/50 p-3 text-xs">{circuit.qasm}</pre>
          </GlassCard>
        ) : null}
        <p className="break-all font-mono text-xs text-muted-foreground">{result.cid}</p>
      </div>
    );
  }

  const run = result.record as RunIpfsRecord;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">{run.name}</h2>
          <p className="text-xs text-muted-foreground">
            {UI.VAULT_CID.sharedBy(run.author)}
          </p>
        </div>
        <VerifiedBadge source={result.source} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <GlassCard>
          <p className="text-xs text-muted-foreground">Qubits</p>
          <p className="text-lg font-medium">{run.qubitCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Peers</p>
          <p className="text-lg font-medium">{run.peerCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Runtime</p>
          <p className="text-lg font-medium">{run.runtime}ms</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-lg font-medium capitalize">{run.status}</p>
        </GlassCard>
      </div>
      {run.circuitCid ? (
        <GlassCard>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Circuit (IPLD link)
          </p>
          <p className="break-all font-mono text-xs text-cyan-400">{run.circuitCid}</p>
        </GlassCard>
      ) : null}
      {run.results ? (
        <GlassCard>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Results</p>
          <pre className="overflow-auto rounded bg-muted/50 p-3 text-xs">
            {JSON.stringify(run.results, null, 2)}
          </pre>
        </GlassCard>
      ) : null}
      <p className="break-all font-mono text-xs text-muted-foreground">{result.cid}</p>
    </div>
  );
}

function CidSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {UI.VAULT_CID.LOADING}
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
