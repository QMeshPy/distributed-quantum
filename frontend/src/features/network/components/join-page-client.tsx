"use client";

import { useState, useEffect } from "react";
import { Network, Copy, Check, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/collapsible";
import { PageHeader } from "@/shared/components/layout/page-header";
import { NodeAppearanceDetector } from "./node-appearance-detector";
import { useRegisterNode } from "../hooks/use-my-nodes";
import { API } from "@/constants/api";

const PIP_INSTALL = `pip install "git+https://github.com/libp2p/py-libp2p.git@main" qiskit qiskit-aer pydantic`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm"
      type="button"
      onClick={handleCopy}
      
      aria-label="Copy to clipboard">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={`relative rounded-xl bg-background/40 ring-1 ring-border ${className ??""}`}>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 pr-10 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 font-mono text-xs font-medium text-accent ring-1 ring-accent/30">
        {n}
      </span>
      <span className="text-sm font-medium text-foreground">{title}</span>
    </div>
  );
}

function ScriptViewer() {
  const [script, setScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (script !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`${API.NETWORK.NODE_SCRIPT}?view=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setScript(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load script");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && (
        <p className="text-xs text-subtle">Loading script…</p>
      )}
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
      {script !== null ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-background/40 px-4 py-3 font-mono text-xs leading-relaxed text-subtle ring-1 ring-border">
          <code>{script}</code>
        </pre>
      ) : !loading && (
        <Button variant="secondary" size="sm" onClick={load} className="self-start">
          Load script
        </Button>
      )}
    </div>
  );
}

interface RegisterForm {
  peerId: string;
  host: string;
  port: string;
  label: string;
}

function ManualRegistrationForm() {
  const { mutate, isPending, isSuccess, error } = useRegisterNode();
  const [form, setForm] = useState<RegisterForm>({
    peerId: "",
    host: "",
    port: "",
    label: "",
  });

  function handleChange(field: keyof RegisterForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      peerId: form.peerId,
      host: form.host,
      port: parseInt(form.port, 10),
      label: form.label || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Input label="Peer ID *"
            id="peerId"
            required
            value={form.peerId}
            onChange={(e) => handleChange("peerId", e.target.value)}
            placeholder="12D3Koo..."
            className="bg-surface-muted border-border font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input label="Host / IP *"
            id="host"
            required
            value={form.host}
            onChange={(e) => handleChange("host", e.target.value)}
            placeholder="0.0.0.0"
            className="bg-surface-muted border-border font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input label="Port *"
            id="port"
            type="number"
            required
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => handleChange("port", e.target.value)}
            placeholder="9000"
            className="bg-surface-muted border-border font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input label="Label"
            id="label"
            value={form.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="my-node"
            className="bg-surface-muted border-border text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? "Registering…" : "Register Node"}
        </Button>
        {isSuccess && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Node registered successfully
          </span>
        )}
        {error && (
          <span className="text-xs text-danger">{error.message}</span>
        )}
      </div>
    </form>
  );
}

export function JoinPageClient() {
  const [scriptViewerOpen, setScriptViewerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [coordinatorMultiaddr, setCoordinatorMultiaddr] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/network/coordinator-info")
      .then((r) => r.json())
      .then((d) => { if (d.multiaddr) setCoordinatorMultiaddr(d.multiaddr); })
      .catch(() => {});
  }, []);

  const runCmd = coordinatorMultiaddr
    ? `curl -fsSL ${origin || ""}/api/network/node-script -o node-starter-template.py && python3 node-starter-template.py --coordinator ${coordinatorMultiaddr} --label my-node`
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Network}
        title="Join the Network"
        description="Run a node and contribute compute to the quantum network."
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">

          {/* Prerequisites */}
          <Panel className="border-border bg-surface-muted">
            <PanelHeader className="pb-3 pt-4">
              <PanelTitle className="text-sm font-medium text-foreground">Prerequisites</PanelTitle>
            </PanelHeader>
            <PanelContent className="flex flex-col gap-2 pb-4 text-sm text-subtle">
              <p>• Python 3.10+</p>
              <p>
                • Install dependencies:{" "}
                <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-accent">
                  {PIP_INSTALL}
                </code>
              </p>
              <p className="text-faint">~400 MB download. A virtual environment is recommended.</p>
            </PanelContent>
          </Panel>

          {/* Step-by-step guide */}
          <Panel className="border-border bg-surface-muted">
            <PanelHeader className="pb-3 pt-4">
              <PanelTitle className="text-sm font-medium text-foreground">Step-by-Step Guide</PanelTitle>
            </PanelHeader>
            <PanelContent className="flex flex-col gap-5 pb-5">

              {/* Step 1 */}
              <div className="flex flex-col gap-2.5">
                <StepLabel n={1} title="Install dependencies" />
                <CodeBlock code={PIP_INSTALL} className="ml-9" />
              </div>

              {/* Step 2 */}
              <div className="flex flex-col gap-2.5">
                <StepLabel n={2} title="Download the node script" />
                <div className="ml-9 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => { window.location.href = API.NETWORK.NODE_SCRIPT; }}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download node-starter-template.py
                  </Button>
                  <Button variant="ghost" size="sm"
                    type="button"
                    onClick={() => setScriptViewerOpen((v) => !v)}>
                    or view inline
                  </Button>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col gap-2.5">
                <StepLabel n={3} title="Run your node" />
                <div className="ml-9 flex flex-col gap-1.5">
                  {runCmd ? (
                    <CodeBlock code={runCmd} />
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-background/40 px-4 py-3 ring-1 ring-border">
                      <span className="h-3 w-3 animate-spin rounded-full border border-border-strong border-t-border-strong" />
                      <span className="font-mono text-xs text-faint">Fetching coordinator address…</span>
                    </div>
                  )}
                  <p className="text-xs text-faint">
                    The coordinator address is fetched live from the network, just copy and run.
                    Change <code className="font-mono text-subtle">--label my-node</code> to your preferred node name.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col gap-2.5">
                <StepLabel n={4} title="Wait for your node to connect" />
                <div className="ml-9">
                  <NodeAppearanceDetector />
                </div>
              </div>

            </PanelContent>
          </Panel>

          {/* Script Viewer (collapsible) */}
          <Collapsible open={scriptViewerOpen} onOpenChange={setScriptViewerOpen}>
            <Panel className="border-border bg-surface-muted">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-foreground">Script Viewer</span>
                  {scriptViewerOpen ? (
                    <ChevronDown className="h-4 w-4 text-faint" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-faint" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-5">
                  <ScriptViewer />
                </div>
              </CollapsibleContent>
            </Panel>
          </Collapsible>

          {/* Manual Registration (collapsible) */}
          <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
            <Panel className="border-border bg-surface-muted">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Manual Registration</span>
                    <span className="text-xs text-faint">
                      Didn&apos;t auto-detect? Register your node manually.
                    </span>
                  </div>
                  {manualOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-5">
                  <ManualRegistrationForm />
                </div>
              </CollapsibleContent>
            </Panel>
          </Collapsible>

        </div>
      </div>
    </div>
  );
}
