"use client";

import { useState, useEffect } from "react";
import { Network, Copy, Check, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md p-1.5 text-white/30 transition-colors hover:text-white/70"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={`relative rounded-xl bg-black/40 ring-1 ring-white/10 ${className ?? ""}`}>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 pr-10 font-mono text-[12px] leading-relaxed text-white/75">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-mono text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
        {n}
      </span>
      <span className="text-sm font-medium text-white/80">{title}</span>
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
        <p className="text-xs text-white/40">Loading script…</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {script !== null ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-black/40 px-4 py-3 font-mono text-[11px] leading-relaxed text-white/60 ring-1 ring-white/10">
          <code>{script}</code>
        </pre>
      ) : !loading && (
        <Button variant="outline" size="sm" onClick={load} className="self-start">
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
          <Label htmlFor="peerId" className="text-xs text-white/50">Peer ID *</Label>
          <Input
            id="peerId"
            required
            value={form.peerId}
            onChange={(e) => handleChange("peerId", e.target.value)}
            placeholder="12D3Koo..."
            className="bg-white/5 border-white/10 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host" className="text-xs text-white/50">Host / IP *</Label>
          <Input
            id="host"
            required
            value={form.host}
            onChange={(e) => handleChange("host", e.target.value)}
            placeholder="0.0.0.0"
            className="bg-white/5 border-white/10 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="port" className="text-xs text-white/50">Port *</Label>
          <Input
            id="port"
            type="number"
            required
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => handleChange("port", e.target.value)}
            placeholder="9000"
            className="bg-white/5 border-white/10 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label" className="text-xs text-white/50">Label</Label>
          <Input
            id="label"
            value={form.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="my-node"
            className="bg-white/5 border-white/10 text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? "Registering…" : "Register Node"}
        </Button>
        {isSuccess && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Node registered successfully
          </span>
        )}
        {error && (
          <span className="text-xs text-red-400">{error.message}</span>
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
        label="Network"
        title="Join the Network"
        description="Run a node and contribute compute to the quantum network."
        glow="indigo"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">

          {/* Prerequisites */}
          <Card className="border-white/8 bg-white/[0.03]">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-medium text-white/70">Prerequisites</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pb-4 text-[13px] text-white/55">
              <p>• Python 3.10+</p>
              <p>
                • Install dependencies:{" "}
                <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">
                  {PIP_INSTALL}
                </code>
              </p>
              <p className="text-white/35">~400 MB download. A virtual environment is recommended.</p>
            </CardContent>
          </Card>

          {/* Step-by-step guide */}
          <Card className="border-white/8 bg-white/[0.03]">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-medium text-white/70">Step-by-Step Guide</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pb-5">

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
                    asChild
                    size="sm"
                  >
                    <a href={API.NETWORK.NODE_SCRIPT} download>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download node-starter-template.py
                    </a>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setScriptViewerOpen((v) => !v)}
                    className="text-xs text-indigo-400 underline-offset-2 hover:underline"
                  >
                    or view inline
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col gap-2.5">
                <StepLabel n={3} title="Run your node" />
                <div className="ml-9 flex flex-col gap-1.5">
                  {runCmd ? (
                    <CodeBlock code={runCmd} />
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-black/40 px-4 py-3 ring-1 ring-white/10">
                      <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
                      <span className="font-mono text-[12px] text-white/30">Fetching coordinator address…</span>
                    </div>
                  )}
                  <p className="text-[11px] text-white/35">
                    The coordinator address is fetched live from the network — just copy and run.
                    Change <code className="font-mono text-white/50">--label my-node</code> to your preferred node name.
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

            </CardContent>
          </Card>

          {/* Script Viewer (collapsible) */}
          <Collapsible open={scriptViewerOpen} onOpenChange={setScriptViewerOpen}>
            <Card className="border-white/8 bg-white/[0.03]">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-white/70">Script Viewer</span>
                  {scriptViewerOpen ? (
                    <ChevronDown className="h-4 w-4 text-white/30" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-white/30" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-5">
                  <ScriptViewer />
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Manual Registration (collapsible) */}
          <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
            <Card className="border-white/8 bg-white/[0.03]">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-white/70">Manual Registration</span>
                    <span className="text-[11px] text-white/30">
                      Didn&apos;t auto-detect? Register your node manually.
                    </span>
                  </div>
                  {manualOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-white/30" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-5">
                  <ManualRegistrationForm />
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

        </div>
      </div>
    </div>
  );
}
