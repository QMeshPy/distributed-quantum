"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Check,
  FileUp,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  FilecoinRequestError,
  formatToken,
  parseReceipt,
  pendingKey,
  readPending,
  requestFilecoin,
  transactionUrl,
} from "./model";
import type {
  AccountBalance,
  FilecoinReceipt,
  PendingWrite,
  StorageAccount,
  StoredArtifact,
} from "./model";
import { ReceiptPanel } from "./receipt-panel";

type Intent = {
  label: string;
  detail: string;
  path: string;
  body: Record<string, unknown>;
};
type TaskRun = {
  run_id: string;
  state: string;
  checkpoint?: FilecoinReceipt;
  outcomes?: unknown[];
  error?: string;
};
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const panelClass = "rounded-xl border border-border bg-card p-5";

export function FilecoinVault() {
  const { user, loading } = useAuth();
  return (
    <FilecoinWorkspace
      key={user?.id ?? "signed-out"}
      userId={user?.id ?? null}
      authLoading={loading}
    />
  );
}

export function FilecoinWorkspace({
  userId,
  authLoading = false,
}: {
  userId: string | null;
  authLoading?: boolean;
}) {
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [artifacts, setArtifacts] = useState<StoredArtifact[]>([]);
  const [agentId, setAgentId] = useState("");
  const [balanceResult, setBalanceResult] = useState<{ agentId: string; value: AccountBalance } | null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const submitting = useRef(false);
  const [busy, setBusy] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [tab, setTab] = useState("archive");
  const [selected, setSelected] = useState<FilecoinReceipt | null>(null);
  const [runId, setRunId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [amount, setAmount] = useState("1");
  const [datasetId, setDatasetId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [task, setTask] = useState<TaskRun | null>(null);
  const [taskConsent, setTaskConsent] = useState(false);
  const [financeJob, setFinanceJob] = useState("");
  const [portfolioBudget, setPortfolioBudget] = useState("2");
  const [lastTx, setLastTx] = useState("");
  const account = accounts.find((item) => item.agent_id === agentId);
  const balance = available && balanceResult?.agentId === agentId ? balanceResult.value : null;
  const canWrite = available && storageReady && !!account && !pending && !busy;

  const refresh = useCallback(() => {
    if (!userId) return Promise.resolve();
    return Promise.all([
        requestFilecoin<{ accounts: StorageAccount[] }>("accounts"),
        requestFilecoin<{ artifacts: StoredArtifact[] }>("artifacts"),
      ]).then(([owned, history]) => {
      setAccounts(owned.accounts);
      setArtifacts(history.artifacts);
      setAvailable(true);
      setAgentId((current) =>
        owned.accounts.some((item) => item.agent_id === current)
          ? current
          : (owned.accounts[0]?.agent_id ?? ""),
      );
      setError("");
    }).catch((e) => {
      setAvailable(false);
      setError(
        e instanceof FilecoinRequestError && e.status === 404
          ? "Filecoin storage is not enabled on this deployment yet."
          : e instanceof Error
            ? e.message
            : "Storage is unavailable.",
      );
    }).finally(() => {
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!userId) return;
    const read = () => {
      try {
        setPending(readPending(localStorage, userId));
        setStorageReady(true);
      } catch {
        setStorageReady(false);
        setError(
          "Browser storage is unavailable. Enable it before submitting a storage transaction.",
        );
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [userId]);
  useEffect(() => {
    let live = true;
    if (agentId && available)
      void requestFilecoin<AccountBalance>(
        `agents/${encodeURIComponent(agentId)}/balance`,
      )
        .then((value) => {
          if (live) setBalanceResult({ agentId, value });
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [agentId, available]);

  function clearPending() {
    if (userId) localStorage.removeItem(pendingKey(userId));
    setPending(null);
  }
  async function sendWrite() {
    if (
      !intent ||
      !account ||
      !userId ||
      pending ||
      submitting.current ||
      !storageReady
    )
      return;
    submitting.current = true;
    const operation: PendingWrite = {
      operation_id: crypto.randomUUID(),
      agent_id: agentId,
      label: intent.label,
      started_at: new Date().toISOString(),
    };
    setBusy(intent.label);
    setError("");
    setNotice("");
    try {
      // Persist the ID before sending; a closed tab must never turn a lost reply into a new payment.
      const existing = readPending(localStorage, userId);
      if (existing) {
        setPending(existing);
        setIntent(null);
        return;
      }
      localStorage.setItem(pendingKey(userId), JSON.stringify(operation));
      setPending(operation);
      const result = await requestFilecoin<Record<string, unknown>>(
        intent.path,
        {
          ...intent.body,
          agent_id: agentId,
          operation_id: operation.operation_id,
        },
      );
      if (result.piece_cid) {
        setSelected(parseReceipt(result));
        setTab("proofs");
      }
      if (typeof result.transaction_hash === "string")
        setLastTx(result.transaction_hash);
      clearPending();
      setIntent(null);
      setNotice(`${intent.label} confirmed.`);
      await refresh();
      setBalanceResult({ agentId, value:
        await requestFilecoin<AccountBalance>(
          `agents/${encodeURIComponent(agentId)}/balance`,
        ),
      });
    } catch (e) {
      if (
        e instanceof FilecoinRequestError &&
        [400, 401, 403, 404, 413, 415, 422].includes(e.status)
      )
        clearPending();
      if (e instanceof FilecoinRequestError && e.status === 409) {
        // A completed conflict response plus no journal entry means validation stopped before a write.
        try {
          await requestFilecoin(
            `agents/${encodeURIComponent(agentId)}/operations/${operation.operation_id}`,
          );
        } catch (lookup) {
          if (lookup instanceof FilecoinRequestError && lookup.status === 404)
            clearPending();
        }
      }
      setError(
        e instanceof Error
          ? e.message
          : "The reply was lost. Check this operation before sending another.",
      );
      setIntent(null);
    } finally {
      submitting.current = false;
      setBusy("");
    }
  }
  async function checkPending() {
    if (!pending) return;
    setBusy("Checking operation");
    setError("");
    try {
      const result = await requestFilecoin<{
        state: string;
        result?: Record<string, unknown>;
        submitted_receipt?: FilecoinReceipt;
      }>(
        `agents/${encodeURIComponent(pending.agent_id)}/operations/${encodeURIComponent(pending.operation_id)}`,
      );
      if (result.result?.piece_cid) setSelected(parseReceipt(result.result));
      if (result.submitted_receipt)
        setSelected(parseReceipt(result.submitted_receipt));
      if (result.state === "confirmed" || result.state === "rejected") {
        clearPending();
        setNotice(
          result.state === "confirmed"
            ? "The operation is confirmed."
            : "The operation was rejected before storage was charged. You can correct it and try again.",
        );
        await refresh();
      } else
        setNotice(
          "The operation still needs reconciliation. Its saved ID is unchanged; no new transaction was sent.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operation status unavailable.",
      );
    } finally {
      setBusy("");
    }
  }
  async function prepareUpload() {
    if (!file || !consent) return;
    if (file.size < 127 || file.size > 16 * 1024 * 1024) {
      setError(
        "Choose a file between 127 bytes and 16 MiB. Package smaller files before publishing.",
      );
      return;
    }
    setBusy("Reading file");
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
          reject(new Error("The selected file could not be read."));
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      setIntent({
        label: "Publish artifact",
        detail: `${file.name} (${file.size.toLocaleString()} bytes) will be publicly retrievable. Storage uses ${account?.agent_name ?? "this agent"}’s test-token allowance.`,
        path: "artifacts",
        body: { data_base64: data, publish_publicly: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read file.");
    } finally {
      setBusy("");
    }
  }
  async function importReceipt(value?: File) {
    if (!value) return;
    try {
      if (value.size > 64 * 1024)
        throw new Error("Receipt JSON must be smaller than 64 KiB.");
      setSelected(parseReceipt(JSON.parse(await value.text())));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid receipt.");
    }
  }
  function payment(action: string) {
    if (!account) return;
    if (
      ["deposit", "withdraw"].includes(action) &&
      (!/^\d+(\.\d{1,18})?$/.test(amount) ||
        Number(amount) <= 0 ||
        Number(amount) > Number(account.max_deposit_usdfc))
    ) {
      setError(
        `Enter an amount above zero and at most ${account.max_deposit_usdfc} test USDFC.`,
      );
      return;
    }
    if (action === "terminate" && !/^\d+$/.test(datasetId)) {
      setError("Enter the dataset ID whose storage should end.");
      return;
    }
    const labels: Record<string, string> = {
      deposit: "Deposit test USDFC",
      withdraw: "Withdraw test USDFC",
      approve: "Authorize storage",
      revoke: "Revoke storage allowance",
      terminate: "End dataset storage",
    };
    const detail =
      action === "approve"
        ? `Authorize up to ${account.max_monthly_usdfc} test USDFC per month and ${account.max_lockup_usdfc} locked test USDFC, with a 30-day lockup ceiling.`
        : action === "terminate"
          ? `End storage for dataset ${datasetId}. This affects every piece in that dataset.`
          : action === "revoke"
            ? "Prevent new storage commitments from using this allowance. Existing obligations may remain."
            : `${action === "deposit" ? "Add" : "Withdraw"} ${amount} test USDFC ${action === "deposit" ? "to" : "from"} this agent’s Filecoin storage balance.`;
    setIntent({
      label: labels[action],
      detail,
      path: "payments",
      body: {
        action,
        ...(["deposit", "withdraw"].includes(action)
          ? { amount_usdfc: amount }
          : {}),
        ...(action === "terminate" ? { data_set_id: datasetId } : {}),
      },
    });
  }
  async function runTasks() {
    if (!selected || !taskId || !taskConsent) return;
    setBusy("Submitting tasks");
    setError("");
    try {
      const value = await requestFilecoin<TaskRun>(
        `tasks/${encodeURIComponent(taskId)}/run`,
        { agent_id: agentId, dataset: selected, publish_publicly: true },
      );
      setTask(value);
      setNotice(
        "Task batch accepted. Refresh its status to see saved checkpoints.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission unavailable. Check the same run ID before resuming.",
      );
    } finally {
      setBusy("");
    }
  }
  async function taskStatus() {
    setBusy("Checking tasks");
    setError("");
    try {
      setTask(
        await requestFilecoin<TaskRun>(`tasks/${encodeURIComponent(taskId)}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task status unavailable.");
    } finally {
      setBusy("");
    }
  }
  async function finance() {
    if (!selected) return;
    setBusy("Submitting finance");
    setError("");
    try {
      const result = await requestFilecoin<{ job_id: string }>(
        "finance-submit",
        { receipt: selected, budget: Number(portfolioBudget) },
      );
      setFinanceJob(result.job_id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Check finance history before submitting again.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        icon={Archive}
        label="Vault / Filecoin"
        title="Keep the work. Keep the evidence."
        description="Publish research artifacts, verify their storage, and continue from saved work."
        glow="blue"
      >
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
          Calibration · test tokens
        </span>
      </PageHeader>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-sm">
            <label
              htmlFor="filecoin-agent"
              className="mb-2 block text-xs font-medium text-muted-foreground"
            >
              Storage agent
            </label>
            <select
              id="filecoin-agent"
              className={selectClass}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={!!busy || !!pending || !accounts.length}
            >
              <option value="">
                {loading ? "Loading your agents…" : "Select a configured agent"}
              </option>
              {accounts.map((item) => (
                <option key={item.agent_id} value={item.agent_id}>
                  {item.agent_name ?? item.agent_id}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading || !!busy}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        {!authLoading && !userId && (
          <p className="text-sm text-muted-foreground">
            <Link href="/signin" className="text-primary underline">
              Sign in
            </Link>{" "}
            to view your Filecoin artifacts.
          </p>
        )}
        {!loading && available && !accounts.length && (
          <div className={panelClass}>
            <h2 className="font-medium">Connect a storage agent</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account has no configured Filecoin wallet yet. Ask the
              project operator to connect a Calibration wallet to one of your
              agents.
            </p>
            <Link
              href="/agents"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary"
            >
              Open agents <ArrowUpRight className="size-4" />
            </Link>
          </div>
        )}
        {pending && (
          <div
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
            role="status"
          >
            <p className="font-medium">
              {busy ? "Operation in progress" : "Check the previous operation"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pending.label}. A reply may arrive after the transaction is
              submitted; another write is paused until this is resolved.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {pending.operation_id}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              disabled={!!busy}
              onClick={() => void checkPending()}
            >
              Check operation
            </Button>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-emerald-400"
          >
            <Check className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="archive">Publish</TabsTrigger>
            <TabsTrigger value="proofs">Saved evidence</TabsTrigger>
            <TabsTrigger value="funding">Agent funding</TabsTrigger>
            <TabsTrigger value="resume">Use a dataset</TabsTrigger>
          </TabsList>
          <TabsContent value="archive" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={panelClass}>
                <h2 className="font-medium">Archive a completed run</h2>
                <p className="mb-5 mt-2 text-sm text-muted-foreground">
                  Preserve its inputs, results, execution plan and NEAR
                  provenance together.
                </p>
                <label
                  htmlFor="archive-run"
                  className="mb-2 block text-xs text-muted-foreground"
                >
                  Completed circuit run ID
                </label>
                <Input
                  id="archive-run"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  placeholder="Run ID from your lab"
                />
                <Button
                  className="mt-4"
                  disabled={
                    !canWrite ||
                    !consent ||
                    !/^[a-zA-Z0-9_-]{1,128}$/.test(runId)
                  }
                  onClick={() =>
                    setIntent({
                      label: "Archive run",
                      detail: `The inputs, outputs and plan for ${runId} will be published publicly.`,
                      path: `runs/${encodeURIComponent(runId)}/archive`,
                      body: { publish_publicly: true },
                    })
                  }
                >
                  <Archive />
                  Archive run
                </Button>
              </section>
              <section className={panelClass}>
                <h2 className="font-medium">Publish a file or dataset</h2>
                <p className="mb-5 mt-2 text-sm text-muted-foreground">
                  Store an experiment package, a finance CSV, or a pharma task
                  dataset.
                </p>
                <label
                  htmlFor="artifact-file"
                  className="mb-2 block text-xs text-muted-foreground"
                >
                  File · 127 bytes to 16 MiB
                </label>
                <Input
                  id="artifact-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  className="mt-4"
                  disabled={!canWrite || !consent || !file}
                  onClick={() => void prepareUpload()}
                >
                  <FileUp />
                  Publish file
                </Button>
              </section>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
              <Checkbox
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
              />
              <span>
                I want to publish this research publicly. Anyone with its
                receipt may retrieve it.
              </span>
            </label>
          </TabsContent>
          <TabsContent value="proofs" className="mt-4 space-y-4">
            <div className={panelClass}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-medium">Your stored research</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose an artifact or open a receipt shared with you.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="receipt-file"
                    className="mb-2 block text-xs text-muted-foreground"
                  >
                    Import receipt JSON
                  </label>
                  <Input
                    id="receipt-file"
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void importReceipt(e.target.files?.[0])}
                  />
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {artifacts.length === 0 ? (
                  <p className="py-5 text-sm text-muted-foreground">
                    No storage operations yet. Publish a file to keep its
                    evidence here.
                  </p>
                ) : (
                  artifacts.map((item) => {
                    const receipt = item.result?.piece_cid
                      ? item.result
                      : item.submitted_receipt;
                    return (
                      <button
                        key={`${item.agent_id}-${item.operation_id}`}
                        type="button"
                        disabled={!receipt}
                        onClick={() => {
                          try {
                            setSelected(parseReceipt(receipt));
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block break-all font-mono text-xs">
                            {receipt?.piece_cid ?? item.operation_id}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.agent_id}
                            {item.created_at
                              ? ` · ${new Date(item.created_at).toLocaleDateString()}`
                              : ""}
                          </span>
                        </span>
                        <span
                          className={`text-xs ${item.state === "confirmed" ? "text-emerald-400" : "text-amber-400"}`}
                        >
                          {item.state.replaceAll("_", " ")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            {selected && (
              <ReceiptPanel key={selected.sha256} receipt={selected} />
            )}
          </TabsContent>
          <TabsContent value="funding" className="mt-4">
            <section className={panelClass}>
              <div className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" />
                <h2 className="font-medium">Agent storage wallet</h2>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {account?.address ?? "Select a configured agent"}
              </p>
              <div className="my-6 grid grid-cols-2 gap-5 md:grid-cols-4">
                <Amount
                  label="Gas balance"
                  value={formatToken(balance?.tfil_base_units)}
                  unit="test FIL"
                />
                <Amount
                  label="Wallet balance"
                  value={formatToken(balance?.usdfc_base_units)}
                  unit="test USDFC"
                />
                <Amount
                  label="Storage balance"
                  value={formatToken(balance?.account.funds)}
                  unit="test USDFC"
                />
                <Amount
                  label="Current rate"
                  value={formatToken(balance?.account.lockupRatePerMonth)}
                  unit="test USDFC / month"
                />
              </div>
              {account && (
                <p className="mb-5 text-sm text-muted-foreground">
                  Limits: {account.max_monthly_usdfc} test USDFC/month,{" "}
                  {account.max_lockup_usdfc} locked. Funding targets{" "}
                  {account.retention_days} days of runway; storage does not
                  expire automatically.
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label
                    htmlFor="storage-amount"
                    className="mb-2 block text-xs text-muted-foreground"
                  >
                    Amount in test USDFC
                  </label>
                  <Input
                    id="storage-amount"
                    className="w-40"
                    type="number"
                    min="0"
                    step="0.1"
                    max={account?.max_deposit_usdfc}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button disabled={!canWrite} onClick={() => payment("deposit")}>
                  Deposit test USDFC
                </Button>
                <Button
                  variant="outline"
                  disabled={!canWrite}
                  onClick={() => payment("approve")}
                >
                  {balance?.approval.isApproved
                    ? "Review storage allowance"
                    : "Authorize storage"}
                </Button>
              </div>
              {lastTx && transactionUrl(lastTx) && (
                <a
                  href={transactionUrl(lastTx)!}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-sm text-primary"
                >
                  View confirmed transaction <ArrowUpRight className="size-4" />
                </a>
              )}
              <details className="mt-6 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Withdraw or end storage
                </summary>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!canWrite}
                    onClick={() => payment("withdraw")}
                  >
                    Withdraw amount
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canWrite}
                    onClick={() => payment("revoke")}
                  >
                    Revoke allowance
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor="end-dataset"
                      className="mb-2 block text-xs text-muted-foreground"
                    >
                      Dataset ID
                    </label>
                    <Input
                      id="end-dataset"
                      value={datasetId}
                      onChange={(e) => setDatasetId(e.target.value)}
                      placeholder="From its storage receipt"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    disabled={!canWrite || !datasetId}
                    onClick={() => payment("terminate")}
                  >
                    End dataset storage
                  </Button>
                </div>
              </details>
            </section>
          </TabsContent>
          <TabsContent value="resume" className="mt-4 space-y-4">
            <div className={panelClass}>
              <h2 className="font-medium">Choose the saved inputs</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select an artifact in Saved evidence, or import its receipt
                below. The input bytes are verified before execution.
              </p>
              <label
                htmlFor="dataset-receipt"
                className="mb-2 mt-4 block text-xs text-muted-foreground"
              >
                Dataset receipt JSON
              </label>
              <Input
                id="dataset-receipt"
                type="file"
                accept=".json,application/json"
                onChange={(e) => void importReceipt(e.target.files?.[0])}
              />
              {selected && (
                <p className="mt-3 break-all font-mono text-xs text-primary">
                  {selected.piece_cid}
                </p>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={panelClass}>
                <h2 className="font-medium">Continue pharma tasks</h2>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                  Use a pharma task dataset. Reusing the same run ID restores
                  completed tasks; unfinished tasks are sent to available
                  workers.
                </p>
                <label
                  htmlFor="task-run"
                  className="mb-2 block text-xs text-muted-foreground"
                >
                  Task run ID
                </label>
                <Input
                  id="task-run"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  placeholder="A name you can reuse to resume"
                />
                <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
                  <Checkbox
                    checked={taskConsent}
                    onCheckedChange={(value) => setTaskConsent(value === true)}
                  />
                  <span>
                    Publish completed task checkpoints using this agent’s
                    storage allowance.
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={
                      !canWrite ||
                      !selected ||
                      !taskConsent ||
                      !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)
                    }
                    onClick={() => void runTasks()}
                  >
                    Run or resume tasks
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy || !taskId || !available}
                    onClick={() => void taskStatus()}
                  >
                    Check run
                  </Button>
                </div>
                {task && (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                    <p className="font-medium">
                      {task.state.replaceAll("_", " ")}
                    </p>
                    {task.error && (
                      <p className="mt-1 text-destructive">{task.error}</p>
                    )}
                    <p className="mt-1 text-muted-foreground">
                      {task.checkpoint
                        ? "A checkpoint is saved."
                        : "No checkpoint saved yet."}
                    </p>
                    {task.checkpoint && (
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(parseReceipt(task.checkpoint));
                          setTab("proofs");
                        }}
                      >
                        Inspect checkpoint
                      </Button>
                    )}
                  </div>
                )}
              </section>
              <section className={panelClass}>
                <h2 className="font-medium">Model a saved finance dataset</h2>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                  Run portfolio analysis on the exact CSV retained on Filecoin.
                  Storage preserves the data; it does not establish its market
                  source.
                </p>
                <label
                  htmlFor="portfolio-budget"
                  className="mb-2 block text-xs text-muted-foreground"
                >
                  Assets to select
                </label>
                <Input
                  id="portfolio-budget"
                  className="w-28"
                  type="number"
                  min="1"
                  max="6"
                  value={portfolioBudget}
                  onChange={(e) => setPortfolioBudget(e.target.value)}
                />
                <Button
                  className="mt-4"
                  disabled={
                    !!busy ||
                    !available ||
                    !selected ||
                    !/^[1-6]$/.test(portfolioBudget) ||
                    !!financeJob
                  }
                  onClick={() => void finance()}
                >
                  Analyze saved CSV
                </Button>
                {financeJob && (
                  <Link
                    href={`/finance/${encodeURIComponent(financeJob)}`}
                    className="mt-4 flex items-center gap-1 text-sm text-primary"
                  >
                    Open finance job <ArrowUpRight className="size-4" />
                  </Link>
                )}
                <Link
                  href="/finance/history"
                  className="mt-4 block text-xs text-muted-foreground underline underline-offset-4"
                >
                  Finance history
                </Link>
              </section>
            </div>
          </TabsContent>
        </Tabs>
        {!!busy && (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 className="size-3 animate-spin" />
            {busy}… Keep this operation ID while confirmation is pending.
          </p>
        )}
      </div>
      <Dialog
        open={!!intent}
        onOpenChange={(open) => {
          if (!open && !busy) setIntent(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{intent?.label}</DialogTitle>
            <DialogDescription>{intent?.detail}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted p-3 text-xs">
            <p>Filecoin Calibration · no real tokens</p>
            <p className="mt-2 break-all font-mono text-muted-foreground">
              {account?.address}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setIntent(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={!!busy || !!pending}
              onClick={() => void sendWrite()}
            >
              {busy ? "Waiting for confirmation…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Amount({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{unit}</p>
    </div>
  );
}
