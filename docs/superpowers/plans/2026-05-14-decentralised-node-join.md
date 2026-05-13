# Decentralised Node Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the stub node script with a fully functional external quantum worker node, add a /network/nodes/join onboarding page with live detection and fallback registration, and add a My Nodes health panel to the nodes page.

**Architecture:** Three independent deliverables sharing a new MongoDB collection (user_nodes) and two new Next.js API routes. The Python script is self-contained with inline copies of the coordinator wire protocols. The frontend follows the existing features/network/ pattern: hook -> API route -> component.

**Tech Stack:** Python 3.11, py-libp2p, Qiskit, Pydantic v2, Trio, AnyIO (script); Next.js 16 App Router, TanStack Query v5, shadcn/ui, Better Auth session, MongoDB via Beanie (frontend).

---

## File Map

### New files
| File | Responsibility |
|---|---|
| scripts/node-starter-template.py | Real external quantum worker node (replaces stub) |
| scripts/requirements-node.txt | pip requirements for node operators |
| frontend/src/app/(main)/network/nodes/join/page.tsx | Route shell, imports JoinPageClient |
| frontend/src/features/network/components/join-page-client.tsx | Full join onboarding page UI |
| frontend/src/features/network/components/node-appearance-detector.tsx | Polls for new peer, shows live status |
| frontend/src/features/network/components/my-node-panel.tsx | Single-node health card |
| frontend/src/features/network/components/my-nodes-button.tsx | Multi-node modal trigger |
| frontend/src/features/network/hooks/use-my-nodes.ts | TanStack Query hook for registered nodes |
| frontend/src/app/api/network/nodes/mine/route.ts | GET + POST registered nodes (MongoDB) |
| frontend/src/app/api/network/node-script/route.ts | Serve node-starter-template.py as download |

### Modified files
| File | Change |
|---|---|
| frontend/src/app/(main)/network/nodes/page.tsx | Add MyNodePanel / MyNodesButton above NodeTable |
| frontend/src/constants/breadcrumbs.ts | Add join entry |
| frontend/src/constants/api.ts | Add NETWORK.NODES_MINE, NETWORK.NODE_SCRIPT |
| frontend/src/constants/query-keys.ts | Add network.myNodes() key |
| frontend/src/features/network/index.ts | Export new components and hook |
| frontend/src/features/network/types.ts | Add MyNode type |

---


## Task 1: Constants and Types

**Files:**
- Modify: `frontend/src/constants/breadcrumbs.ts`
- Modify: `frontend/src/constants/api.ts`
- Modify: `frontend/src/constants/query-keys.ts`
- Modify: `frontend/src/features/network/types.ts`

- [ ] **Step 1: Add breadcrumb entry**

In `frontend/src/constants/breadcrumbs.ts`, add `join: "Join"` to `BREADCRUMB_LABELS`:
```ts
join: "Join",
```
(add after the `nodes: "Nodes"` entry)

- [ ] **Step 2: Add API constants**

In `frontend/src/constants/api.ts`, extend the `NETWORK` object:
```ts
NETWORK: {
  // ...existing entries...
  NODES_MINE: "/api/network/nodes/mine",
  NODE_SCRIPT: "/api/network/node-script",
  PEER: (id: string) => `/api/network/peers/${id}` as const,
},
```

- [ ] **Step 3: Add query key**

In `frontend/src/constants/query-keys.ts`, extend the `network` object:
```ts
network: {
  // ...existing entries...
  myNodes: () => ["network", "my-nodes"] as const,
},
```

- [ ] **Step 4: Add MyNode type**

In `frontend/src/features/network/types.ts`, append:
```ts
export interface MyNode {
  peerId: string;
  label: string | null;
  host: string | null;
  port: number | null;
  registeredAt: string;
}

export interface MyNodesResponse {
  nodes: MyNode[];
}

export interface RegisterNodeRequest {
  peerId: string;
  host: string;
  port: number;
  label?: string;
}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/constants/breadcrumbs.ts frontend/src/constants/api.ts \
        frontend/src/constants/query-keys.ts frontend/src/features/network/types.ts
git commit -m "feat(network): add constants and types for node join feature"
```

---

## Task 2: MongoDB API Routes (GET + POST /api/network/nodes/mine)

**Files:**
- Create: `frontend/src/app/api/network/nodes/mine/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/features/auth/server/session";
import { getMongoDb } from "@/lib/mongodb";

interface UserNodeDoc {
  user_id: string;
  peer_id: string;
  label: string | null;
  host: string | null;
  port: number | null;
  registered_at: string;
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = await getMongoDb();
    const docs = await db
      .collection<UserNodeDoc>("user_nodes")
      .find({ user_id: session.user.id })
      .sort({ registered_at: -1 })
      .toArray();
    return NextResponse.json({
      nodes: docs.map((d) => ({
        peerId: d.peer_id,
        label: d.label,
        host: d.host,
        port: d.port,
        registeredAt: d.registered_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch nodes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { peerId, host, port, label } = body as {
    peerId: string;
    host: string;
    port: number;
    label?: string;
  };
  if (!peerId || typeof peerId !== "string" || peerId.length < 10) {
    return NextResponse.json({ error: "Invalid peerId" }, { status: 400 });
  }
  if (!host || typeof host !== "string") {
    return NextResponse.json({ error: "Invalid host" }, { status: 400 });
  }
  if (!port || typeof port !== "number" || port < 1024 || port > 65535) {
    return NextResponse.json({ error: "Invalid port" }, { status: 400 });
  }
  try {
    const db = await getMongoDb();
    const existing = await db
      .collection<UserNodeDoc>("user_nodes")
      .findOne({ user_id: session.user.id, peer_id: peerId });
    if (existing) {
      return NextResponse.json({ error: "Already registered" }, { status: 409 });
    }
    const now = new Date().toISOString();
    await db.collection<UserNodeDoc>("user_nodes").insertOne({
      user_id: session.user.id,
      peer_id: peerId,
      label: label ?? null,
      host,
      port,
      registered_at: now,
    });
    return NextResponse.json({ peerId, label: label ?? null, registeredAt: now }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to register node" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Check if getMongoDb helper exists**

Run:
```bash
grep -r "getMongoDb\|getMongo" frontend/src/lib/ frontend/src/features/ --include="*.ts" -l 2>/dev/null | head -5
```

If it does not exist, check how MongoDB is accessed in an existing route (e.g. vault pinning) and follow the same pattern. The `user_nodes` collection is plain MongoDB — no Beanie document needed.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/app/api/network/nodes/mine/route.ts
git commit -m "feat(network): add GET/POST /api/network/nodes/mine route"
```

---

## Task 3: Node Script Download Route

**Files:**
- Create: `frontend/src/app/api/network/node-script/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") === "1";

  try {
    // Resolve from repo root: process.cwd() is the frontend dir, go up one level
    const scriptPath = join(process.cwd(), "..", "scripts", "node-starter-template.py");
    const content = readFileSync(scriptPath, "utf-8");

    if (view) {
      return new NextResponse(content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=\"node-starter-template.py\"",
      },
    });
  } catch {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/app/api/network/node-script/route.ts
git commit -m "feat(network): add node script download route"
```

---


## Task 4: useMyNodes Hook

**Files:**
- Create: `frontend/src/features/network/hooks/use-my-nodes.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { MyNodesResponse, RegisterNodeRequest, MyNode } from "../types";

export function useMyNodes() {
  return useQuery({
    queryKey: QUERY_KEYS.network.myNodes(),
    queryFn: async (): Promise<MyNode[]> => {
      const res = await fetch(API.NETWORK.NODES_MINE);
      if (!res.ok) return [];
      const data = (await res.json()) as MyNodesResponse;
      return data.nodes;
    },
    staleTime: 60_000,
  });
}

export function useRegisterNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterNodeRequest) => {
      const res = await fetch(API.NETWORK.NODES_MINE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) throw new Error("Already registered");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to register node");
      }
      return res.json() as Promise<MyNode>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.myNodes() });
    },
  });
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/features/network/hooks/use-my-nodes.ts
git commit -m "feat(network): add useMyNodes and useRegisterNode hooks"
```

---

## Task 5: NodeAppearanceDetector Component

**Files:**
- Create: `frontend/src/features/network/components/node-appearance-detector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants";
import type { BackendPeerListResponse } from "../types";

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

type DetectorState = "waiting" | "found" | "timeout";

export function NodeAppearanceDetector() {
  const [state, setState] = useState<DetectorState>("waiting");
  const [foundPeerId, setFoundPeerId] = useState<string | null>(null);
  const initialPeerIds = useRef<Set<string> | null>(null);
  const startedAt = useRef(Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    async function snapshot() {
      const res = await fetch("/api/network/peers");
      if (!res.ok) return new Set<string>();
      const data = (await res.json()) as BackendPeerListResponse;
      return new Set(data.peers.map((p) => p.peer_id));
    }

    async function poll() {
      const initial = await snapshot();
      initialPeerIds.current = initial;

      while (active) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!active) break;

        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          setState("timeout");
          break;
        }

        const current = await snapshot();
        for (const id of current) {
          if (!initialPeerIds.current!.has(id)) {
            setFoundPeerId(id);
            setState("found");
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.nodes() });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.myNodes() });
            return;
          }
        }
      }
    }

    poll();
    return () => { active = false; };
  }, [queryClient]);

  if (state === "found" && foundPeerId) {
    return (
      <div className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-emerald-500/30"
        style={{ background: "rgba(16,185,129,0.07)" }}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-emerald-300">Your node joined the network!</p>
          <p className="font-mono text-xs text-white/50 break-all">{foundPeerId}</p>
          <a href="/network/nodes" className="mt-1 text-xs text-emerald-400 underline underline-offset-2">
            View in nodes table →
          </a>
        </div>
      </div>
    );
  }

  if (state === "timeout") {
    return (
      <div className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-amber-500/20"
        style={{ background: "rgba(245,158,11,0.06)" }}>
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-300">Still waiting after 10 minutes</p>
          <p className="mt-0.5 text-xs text-white/40">
            Try the manual registration form below if your node is running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl p-4 ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.04)" }}>
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
      <p className="text-sm text-white/50">
        Waiting for your node to appear… checking every 5 seconds
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/features/network/components/node-appearance-detector.tsx
git commit -m "feat(network): add NodeAppearanceDetector component"
```

---


## Task 6: Join Page Client Component

**Files:**
- Create: `frontend/src/features/network/components/join-page-client.tsx`
- Create: `frontend/src/app/(main)/network/nodes/join/page.tsx`

- [ ] **Step 1: Create the page shell**

```tsx
// frontend/src/app/(main)/network/nodes/join/page.tsx
import { JoinPageClient } from "@/features/network/components/join-page-client";

export default function JoinPage() {
  return <JoinPageClient />;
}
```

- [ ] **Step 2: Create join-page-client.tsx (part A — imports + register form)**

```tsx
"use client";
import { useState } from "react";
import { Network, Download, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/shared/components/layout/page-header";
import { NodeAppearanceDetector } from "./node-appearance-detector";
import { useRegisterNode } from "../hooks/use-my-nodes";
import { API } from "@/constants";
import type { RegisterNodeRequest } from "../types";

const INSTALL_CMD = "pip install py-libp2p qiskit pydantic trio anyio multiaddr";
const RUN_CMD = `python node-starter-template.py \\
  --coordinator /ip4/<COORDINATOR_IP>/tcp/4011/p2p/<COORDINATOR_PEER_ID> \\
  --label "My Quantum Node" \\
  --port 4030 \\
  --advertise-addr /ip4/<YOUR_PUBLIC_IP>/tcp/4030`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1.5 rounded-lg bg-white/6 px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative rounded-xl ring-1 ring-white/8 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
      {label && (
        <div className="flex items-center justify-between border-b border-white/6 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">{label}</span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-white/70 whitespace-pre-wrap">{code}</pre>
      {!label && (
        <div className="absolute right-2 top-2">
          <CopyButton text={code} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create join-page-client.tsx (part B — register form + script viewer + full export)**

Append to the same file:
```tsx
function RegisterFallbackForm() {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<RegisterNodeRequest>();
  const { mutateAsync, isPending } = useRegisterNode();

  async function onSubmit(data: RegisterNodeRequest) {
    try {
      await mutateAsync(data);
      toast.success("Node registered successfully");
      reset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to register node");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label className="text-xs text-white/50">Peer ID <span className="text-red-400">*</span></Label>
          <Input
            placeholder="12D3KooW..."
            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
            {...register("peerId", { required: true, minLength: 10 })}
          />
          {errors.peerId && <p className="text-xs text-red-400">Valid peer ID required (min 10 chars)</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-white/50">Host / IP <span className="text-red-400">*</span></Label>
          <Input
            placeholder="203.0.113.1"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
            {...register("host", { required: true })}
          />
          {errors.host && <p className="text-xs text-red-400">Host required</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-white/50">Port <span className="text-red-400">*</span></Label>
          <Input
            type="number"
            placeholder="4030"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
            {...register("port", { required: true, valueAsNumber: true, min: 1024, max: 65535 })}
          />
          {errors.port && <p className="text-xs text-red-400">Port must be 1024–65535</p>}
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label className="text-xs text-white/50">Label (optional)</Label>
          <Input
            placeholder="My Quantum Node"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
            {...register("label", { maxLength: 50 })}
          />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="self-start bg-blue-600 hover:bg-blue-500 text-white">
        {isPending ? "Registering…" : "Register Node"}
      </Button>
    </form>
  );
}

function ScriptViewer() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  async function load() {
    if (source !== null) return;
    const res = await fetch(`${API.NETWORK.NODE_SCRIPT}?view=1`);
    if (res.ok) setSource(await res.text());
  }

  return (
    <div className="rounded-2xl ring-1 ring-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => { setOpen((v) => !v); load(); }}
      >
        <span className="text-sm font-medium text-white/60">View full script source</span>
        {open ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>
      {open && (
        <div className="border-t border-white/6 max-h-[500px] overflow-y-auto px-4 pb-4">
          {source ? (
            <CodeBlock code={source} />
          ) : (
            <p className="py-4 text-center text-xs text-white/30">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl ring-1 ring-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-medium text-white/60">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>
      {open && <div className="border-t border-white/6 px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

export function JoinPageClient() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Network}
        label="Network"
        title="Join the Network"
        glow="blue"
        description="Run your own quantum compute node and contribute to the decentralised fabric."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">

          {/* Prerequisites */}
          <div className="rounded-2xl p-5 ring-1 ring-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">Prerequisites</p>
            <ul className="flex flex-col gap-2 text-sm text-white/60">
              {["Python 3.11 or newer", "An open TCP port (default: 4030)", "~300 MB disk for Qiskit", "Network connectivity to coordinator on port 4011"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-4">
            {[
              {
                n: 1,
                title: "Install dependencies",
                content: <CodeBlock code={INSTALL_CMD} label="bash" />,
              },
              {
                n: 2,
                title: "Download the node script",
                content: (
                  <div className="flex items-center gap-3">
                    <a href={API.NETWORK.NODE_SCRIPT} download="node-starter-template.py">
                      <Button className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                        <Download className="h-4 w-4" />
                        Download node-starter-template.py
                      </Button>
                    </a>
                    <span className="text-xs text-white/30">or use the script viewer below</span>
                  </div>
                ),
              },
              {
                n: 3,
                title: "Run the node",
                content: (
                  <>
                    <p className="mb-2 text-xs text-white/40">
                      Replace <code className="rounded bg-white/8 px-1 text-white/60">&lt;COORDINATOR_IP&gt;</code>,{" "}
                      <code className="rounded bg-white/8 px-1 text-white/60">&lt;COORDINATOR_PEER_ID&gt;</code>, and{" "}
                      <code className="rounded bg-white/8 px-1 text-white/60">&lt;YOUR_PUBLIC_IP&gt;</code> with your values.
                      The coordinator multiaddr is in your deployment config under <code className="rounded bg-white/8 px-1 text-white/60">QB2_LIBP2P_LISTEN_MULTIADDRS</code>.
                    </p>
                    <CodeBlock code={RUN_CMD} label="bash" />
                  </>
                ),
              },
              {
                n: 4,
                title: "Wait for your node to appear",
                content: <NodeAppearanceDetector />,
              },
            ].map((step) => (
              <div key={step.n} className="flex gap-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/30">
                  {step.n}
                </div>
                <div className="flex flex-1 flex-col gap-2 pt-0.5">
                  <p className="text-sm font-medium text-white/70">{step.title}</p>
                  {step.content}
                </div>
              </div>
            ))}
          </div>

          <ScriptViewer />

          <Collapsible title="Node didn't appear automatically?">
            <p className="mb-4 text-xs text-white/40">
              If your node is running but hasn't appeared in the table after 2 minutes, register it manually.
              This is common when your coordinator and node are behind NAT.
            </p>
            <RegisterFallbackForm />
          </Collapsible>

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/app/(main)/network/nodes/join/page.tsx \
        frontend/src/features/network/components/join-page-client.tsx
git commit -m "feat(network): add /network/nodes/join onboarding page"
```

---

## Task 7: My Node Panel and My Nodes Button

**Files:**
- Create: `frontend/src/features/network/components/my-node-panel.tsx`
- Create: `frontend/src/features/network/components/my-nodes-button.tsx`

- [ ] **Step 1: Create my-node-panel.tsx**

```tsx
"use client";
import { useState } from "react";
import { Server, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNetworkNodes } from "../hooks/use-network-nodes";
import { getHealthBadgeVariant } from "../lib/network-transformers";
import type { MyNode } from "../types";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PeerIdCopy({ peerId }: { peerId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

interface MyNodeCardProps {
  node: MyNode;
}

export function MyNodeCard({ node }: MyNodeCardProps) {
  const { data: peers, refetch, isFetching } = useNetworkNodes();
  const live = peers?.find((p) => p.peerId === node.peerId);
  const isOnline = !!live;

  async function ping() {
    await refetch();
    toast.info("Node status refreshed");
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/8 transition-all"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10">
            <Server className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">{node.label ?? "My Node"}</p>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] text-white/30">{node.peerId.slice(0, 24)}…</span>
              <PeerIdCopy peerId={node.peerId} />
            </div>
          </div>
        </div>
        <Badge
          variant={isOnline ? getHealthBadgeVariant("healthy") : getHealthBadgeVariant("offline")}
          className={isOnline
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
            : "bg-white/6 text-white/30 border-white/10"
          }
        >
          {isOnline ? "Online" : "Offline"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Health", value: live?.healthStatus ?? "—", mono: false },
          { label: "Reservations", value: live?.activeReservations ?? "—", mono: true },
          { label: "Executions", value: live?.activeExecutions ?? "—", mono: true },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col items-center rounded-lg bg-white/[0.03] px-2 py-2.5 ring-1 ring-white/6">
            <span className={`text-base font-semibold text-white ${stat.mono ? "tabular-nums" : "capitalize"}`}>{String(stat.value)}</span>
            <span className="text-[10px] text-white/30">{stat.label}</span>
          </div>
        ))}
      </div>

      {live && (
        <p className="mb-3 text-xs text-white/30">Last seen {formatRelativeTime(live.lastSeenAt)}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={ping}
          disabled={isFetching}
          className="h-8 gap-1.5 px-3 text-xs text-white/50 hover:text-white/80"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Ping
        </Button>
        <a href="/network/nodes/join">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-3 text-xs text-white/50 hover:text-white/80">
            <ExternalLink className="h-3 w-3" />
            Setup guide
          </Button>
        </a>
      </div>
    </div>
  );
}

export function MyNodePanel({ node }: { node: MyNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">My Node</p>
      <MyNodeCard node={node} />
    </div>
  );
}
```

- [ ] **Step 2: Create my-nodes-button.tsx**

```tsx
"use client";
import { useState } from "react";
import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { MyNodeCard } from "./my-node-panel";
import type { MyNode } from "../types";

export function MyNodesButton({ nodes }: { nodes: MyNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white/80"
      >
        <Server className="h-4 w-4" />
        My Nodes · {nodes.length}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-lg border-white/10 bg-[#0f1218] ring-1 ring-white/8">
          <DialogTitle className="border-b border-white/8 px-5 py-4 text-sm font-medium text-white/70">
            My Nodes
          </DialogTitle>
          <div className="flex flex-col gap-4 overflow-y-auto p-5" style={{ maxHeight: "calc(85vh - 70px)" }}>
            {nodes.map((node) => (
              <MyNodeCard key={node.peerId} node={node} />
            ))}
            <a href="/network/nodes/join" className="text-center text-xs text-blue-400 hover:underline">
              + Add another node
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/features/network/components/my-node-panel.tsx \
        frontend/src/features/network/components/my-nodes-button.tsx
git commit -m "feat(network): add MyNodePanel and MyNodesButton components"
```

---

## Task 8: Wire My Nodes into the Nodes Page

**Files:**
- Modify: `frontend/src/app/(main)/network/nodes/page.tsx`
- Modify: `frontend/src/features/network/index.ts`

- [ ] **Step 1: Update the nodes page**

Replace the current contents of `frontend/src/app/(main)/network/nodes/page.tsx`:

```tsx
import { Server } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { NodeTable } from "@/features/network/components/node-table";
import { NodesPageClient } from "@/features/network/components/nodes-page-client";

export default function NodesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Server}
        label="Network"
        title="Nodes"
        glow="blue"
        description="All discovered peers — status, trust tier, and execution load."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <NodesPageClient />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create nodes-page-client.tsx**

Create `frontend/src/features/network/components/nodes-page-client.tsx`:

```tsx
"use client";
import { useMyNodes } from "../hooks/use-my-nodes";
import { MyNodePanel } from "./my-node-panel";
import { MyNodesButton } from "./my-nodes-button";
import { NodeTable } from "./node-table";

export function NodesPageClient() {
  const { data: myNodes } = useMyNodes();
  const nodes = myNodes ?? [];

  return (
    <>
      {nodes.length === 1 && <MyNodePanel node={nodes[0]} />}
      {nodes.length > 1 && <MyNodesButton nodes={nodes} />}
      <NodeTable />
    </>
  );
}
```

- [ ] **Step 3: Update the network feature barrel**

In `frontend/src/features/network/index.ts`, add:
```ts
export { NodesPageClient } from "./components/nodes-page-client";
export { MyNodePanel, MyNodeCard } from "./components/my-node-panel";
export { MyNodesButton } from "./components/my-nodes-button";
export { NodeAppearanceDetector } from "./components/node-appearance-detector";
export { useMyNodes, useRegisterNode } from "./hooks/use-my-nodes";
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/app/(main)/network/nodes/page.tsx \
        frontend/src/features/network/components/nodes-page-client.tsx \
        frontend/src/features/network/index.ts
git commit -m "feat(network): wire My Nodes panel into /network/nodes page"
```

---

## Task 9: Real External Node Script

**Files:**
- Modify: `scripts/node-starter-template.py` (replace existing stub)
- Create: `scripts/requirements-node.txt`

This is the largest task. The script is fully self-contained — no imports from the coordinator package.

- [ ] **Step 1: Create requirements-node.txt**

```
# Requirements for running an external quantum network node
# Install with: pip install -r requirements-node.txt
py-libp2p>=0.2.0
qiskit>=1.0.0
pydantic>=2.0.0
trio>=0.22.0
anyio>=4.0.0
multiaddr>=0.0.9
```

- [ ] **Step 2: Write the script header, imports, and inline wire schemas**

Replace `scripts/node-starter-template.py` with the following (write in full, do not truncate):

```python
#!/usr/bin/env python3
"""
Quantum Network Node
====================
A real external worker node for the distributed quantum compute network.

This script connects to the coordinator via libp2p, advertises quantum services,
and processes real circuit fragment execution requests — identical to the embedded
worker peers that run inside the coordinator process.

Usage
-----
pip install -r requirements-node.txt
python node-starter-template.py \
    --coordinator /ip4/<IP>/tcp/4011/p2p/<PEER_ID> \
    --label "My Node" \
    --port 4030 \
    --advertise-addr /ip4/<PUBLIC_IP>/tcp/4030

Requirements
------------
py-libp2p, qiskit, pydantic>=2, trio, anyio, multiaddr
"""

from __future__ import annotations

import argparse
import ast
import asyncio
import hashlib
import logging
import queue
import signal
import sys
import threading
import time
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import partial
from math import e, pi, tau
from pathlib import Path
from time import perf_counter
from typing import Any

try:
    import anyio
    import trio
    from libp2p import create_new_ed25519_key_pair, new_host
    from libp2p.abc import IHost
    from libp2p.custom_types import TProtocol
    from libp2p.peer.id import ID
    from libp2p.peer.peerinfo import info_from_p2p_addr
    from libp2p.peer.peerstore import create_signed_peer_record
    from libp2p.pubsub.gossipsub import GossipSub
    from libp2p.pubsub.pubsub import Pubsub
    from libp2p.tools.anyio_service import background_trio_service
    from multiaddr import Multiaddr
    from pydantic import BaseModel, ConfigDict, Field, field_validator
    from qiskit import QuantumCircuit
    from qiskit.circuit import Gate
    from qiskit.circuit.library import (
        HGate, PhaseGate, QFTGate, RXGate, RYGate, RZGate,
        SGate, SXGate, SwapGate, TGate, UGate, XGate, YGate, ZGate,
    )
    from qiskit.quantum_info import Statevector, state_fidelity
except ImportError as exc:
    print(f"Missing dependency: {exc}")
    print("Install with: pip install -r requirements-node.txt")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_GOSSIPSUB_PROTOCOL_ID = TProtocol("/meshsub/1.0.0")
_BOOTSTRAP_RETRIES = 20
_BOOTSTRAP_RETRY_DELAY = 0.5
_STREAM_READ_MAX = 2 ** 32 - 1
_ADVERTISEMENT_EVERY_N_HEARTBEATS = 5
_NUMERIC_CONSTANTS = {"e": e, "pi": pi, "tau": tau}
_KNOWN_SERVICE_IDS = (
    "hadamard", "cnot", "cz", "controlled_unitary", "programmable_gate",
    "qft", "teleportation", "bell_pair", "syndrome_extraction",
    "distillation", "measurement_feedforward",
)


# ---------------------------------------------------------------------------
# Inline wire schemas (byte-for-byte match with coordinator protocols/)
# ---------------------------------------------------------------------------
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ServiceAdvertisementSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    quantum_capability: str = Field(min_length=2)
    benchmark_mode: str = Field(min_length=3)


class PeerAdvertisement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    peer_id: str = Field(min_length=3)
    trust_tier: str = Field(min_length=3)
    network_addresses: tuple[str, ...] = Field(default_factory=tuple)
    supported_protocols: tuple[str, ...] = Field(default_factory=tuple)
    service_summaries: tuple[ServiceAdvertisementSummary, ...] = Field(default_factory=tuple)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _tz(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("emitted_at must be timezone-aware")
        return v.astimezone(timezone.utc)


class PeerHeartbeat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    peer_id: str = Field(min_length=3)
    health_status: str = Field(min_length=2)
    active_reservations: int = Field(default=0, ge=0)
    active_executions: int = Field(default=0, ge=0)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _tz(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("emitted_at must be timezone-aware")
        return v.astimezone(timezone.utc)


class ReservationTransition(str):
    ACCEPTED = "accepted"
    COMMITTED = "committed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class ReservationPrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    requesting_peer_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    estimated_qubits: int = Field(ge=1)
    estimated_depth: int = Field(ge=1)
    priority: int = Field(default=0, ge=0, le=100)
    ttl_seconds: int = Field(default=60, ge=5)
    idempotency_key: str = Field(min_length=8)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationPrepareResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    accepting_peer_id: str = Field(min_length=3)
    transition: str
    reason: str | None = Field(default=None, max_length=300)
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    transition: str
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    reason: str | None = Field(default=None, max_length=300)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    transition: str
    replied_at: datetime = Field(default_factory=_utc_now)


class DistributedStateHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    num_qubits: int = Field(ge=1)
    qubit_ids: tuple[int, ...] | None = None
    amplitudes: tuple[str, ...] | None = None
    measured_qubits: tuple[int, ...] = Field(default_factory=tuple)
    previous_peer_id: str | None = Field(default=None, min_length=3)


class FragmentDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    qubits: tuple[int, ...] = Field(default_factory=tuple)
    operation_ids: tuple[str, ...] = Field(default_factory=tuple)
    dependencies: tuple[str, ...] = Field(default_factory=tuple)
    raw_text: str = ""


class FragmentDispatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    plan_id: str = Field(min_length=8)
    block_id: str | None = Field(default=None, min_length=3)
    fragment: FragmentDescriptor | None = None
    fragments: tuple[FragmentDescriptor, ...] = Field(default_factory=tuple)
    state: DistributedStateHandoff

    def fragment_bundle(self) -> tuple[FragmentDescriptor, ...]:
        if self.fragments:
            return self.fragments
        if self.fragment is not None:
            return (self.fragment,)
        return ()


class FragmentDispatchOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    state: DistributedStateHandoff
    block_id: str | None = Field(default=None, min_length=3)
    fragment_ids: tuple[str, ...] = Field(default_factory=tuple)
    component_qubits: tuple[int, ...] = Field(default_factory=tuple)
    gate_count: int = Field(default=0, ge=0)
    circuit_depth: int = Field(default=0, ge=0)
    state_transfer_bytes: int = Field(default=0, ge=0)


class FragmentDispatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    execution_id: str = Field(min_length=8)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    input_payload: dict[str, Any] = Field(default_factory=dict)
    max_retries: int = Field(default=2, ge=0, le=10)
    idempotency_key: str = Field(min_length=8)
    dispatched_at: datetime = Field(default_factory=_utc_now)


class ExecutionTransition(str):
    COMPLETED = "completed"
    FAILED = "failed"


class ExecutionResultPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    executing_peer_id: str = Field(min_length=3)
    transition: str
    output_payload: dict[str, Any] = Field(default_factory=dict)
    latency_ms: float | None = Field(default=None, ge=0.0)
    fidelity_score: float | None = Field(default=None, ge=0.0, le=1.0)
    error_detail: str | None = Field(default=None, max_length=600)
    artifact_refs: list[str] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=_utc_now)
```


- [ ] **Step 3: Write quantum execution engine (apply_fragments_to_state and helpers)**

Append to the same file (after the wire schemas):

```python
# ---------------------------------------------------------------------------
# Quantum execution engine (mirrors application/distributed_statevector.py)
# ---------------------------------------------------------------------------

def _handoff_qubit_ids(state: DistributedStateHandoff) -> tuple[int, ...]:
    return state.qubit_ids or tuple(range(state.num_qubits))


def _statevector_from_handoff(state: DistributedStateHandoff) -> Statevector:
    if not state.amplitudes:
        v = [0j] * (2 ** state.num_qubits)
        v[0] = 1 + 0j
        return Statevector(v)
    return Statevector([complex(a) for a in state.amplitudes])


def _serialize_statevector(sv: Statevector) -> tuple[str, ...]:
    def _fmt(c: complex) -> str:
        r, i = round(c.real, 12), round(c.imag, 12)
        if i == 0:
            return str(r)
        if r == 0:
            return f"{i}j"
        return f"{r}+{i}j" if i >= 0 else f"{r}{i}j"
    return tuple(_fmt(complex(v)) for v in sv.data)


def _evaluate_numeric(expr: str) -> float:
    node = ast.parse(expr.replace("^", "**").strip(), mode="eval")

    def _eval(n: ast.AST) -> float:
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.Name) and n.id in _NUMERIC_CONSTANTS:
            return float(_NUMERIC_CONSTANTS[n.id])
        if isinstance(n, ast.BinOp):
            l, r = _eval(n.left), _eval(n.right)
            ops = {ast.Add: l + r, ast.Sub: l - r, ast.Mult: l * r,
                   ast.Div: l / r, ast.Pow: l ** r, ast.Mod: l % r}
            return ops[type(n.op)]
        if isinstance(n, ast.UnaryOp):
            o = _eval(n.operand)
            return o if isinstance(n.op, ast.UAdd) else -o
        raise ValueError(f"Unsupported: {ast.dump(n)}")

    return _eval(node.body)


def _parse_params(block: str | None) -> list[float]:
    if not block or not block.strip():
        return []
    return [_evaluate_numeric(p.strip()) for p in block.split(",")]


def _build_base_gate(name: str, params: list[float]) -> Gate | None:
    if name in {"id", "identity"}:
        return None
    simple: dict[str, Gate] = {
        "h": HGate(), "x": XGate(), "y": YGate(), "z": ZGate(),
        "s": SGate(), "sdg": SGate().inverse(), "t": TGate(),
        "tdg": TGate().inverse(), "sx": SXGate(), "sxdg": SXGate().inverse(),
        "cx": XGate().control(1), "cnot": XGate().control(1),
        "cy": YGate().control(1), "cz": ZGate().control(1), "swap": SwapGate(),
    }
    if name in simple:
        return simple[name]
    if name in {"rx", "ry", "rz", "p", "phase"} and not params:
        return None
    if name == "rx":
        return RXGate(params[0])
    if name == "ry":
        return RYGate(params[0])
    if name == "rz":
        return RZGate(params[0])
    if name in {"p", "phase"}:
        return PhaseGate(params[0])
    if name == "u":
        if len(params) == 1:
            return PhaseGate(params[0])
        if len(params) >= 3:
            return UGate(params[0], params[1], params[2])
    return None


def _apply_raw(circuit: QuantumCircuit, *, raw: str, qubits: tuple[int, ...],
               global_qubits: tuple[int, ...], measured: list[int]) -> bool:
    import re
    line = raw.split("//", 1)[0].strip().removesuffix(";")
    if not line:
        return False

    ctrl_m = re.match(
        r"^controlled\s+(?P<g>[A-Za-z_]\w*)(?:\((?P<p>[^)]*)\))?\s+.+$", line, re.I)
    if ctrl_m:
        g, p = ctrl_m.group("g").lower(), _parse_params(ctrl_m.group("p"))
        base = _build_base_gate(g, p)
        if base is None:
            return True
        tgt = base.num_qubits
        ctrl = len(qubits) - tgt
        if ctrl < 1:
            return True
        ordered = list(qubits[: ctrl + tgt])
        if len(set(ordered)) == len(ordered):
            circuit.append(base.control(ctrl), ordered)
        return True

    m = re.match(r"^(?P<g>[A-Za-z_]\w*)(?:\((?P<p>[^)]*)\))?\s+.+$", line, re.I)
    if not m:
        return False
    g, p = m.group("g").lower(), _parse_params(m.group("p"))

    if g == "measure":
        for q in global_qubits:
            if q not in measured:
                measured.append(q)
        return True
    if g in {"teleport", "teleportation"} and len(qubits) >= 2:
        circuit.swap(qubits[0], qubits[1])
        return True
    if g == "bell_pair" and len(qubits) >= 2:
        circuit.h(qubits[0]); circuit.cx(qubits[0], qubits[1])
        return True
    if g == "qft" and qubits:
        circuit.compose(QFTGate(len(qubits)), qubits=list(qubits), inplace=True)
        return True
    if g == "iqft" and qubits:
        circuit.compose(QFTGate(len(qubits)).inverse(), qubits=list(qubits), inplace=True)
        return True
    if g in {"ccnot", "ccx"} and len(qubits) >= 3:
        circuit.ccx(qubits[0], qubits[1], qubits[2])
        return True
    if g == "cswap" and len(qubits) >= 3:
        circuit.cswap(qubits[0], qubits[1], qubits[2])
        return True
    if g in {"syndrome_extraction", "distillation"}:
        return True
    gate = _build_base_gate(g, p)
    if gate is None:
        return True
    req = gate.num_qubits
    if len(qubits) >= req:
        circuit.append(gate, list(qubits[:req]))
    return True


def _apply_fragment(circuit: QuantumCircuit, *, fragment: FragmentDescriptor,
                    measured: list[int], local: tuple[int, ...],
                    global_q: tuple[int, ...]) -> None:
    if fragment.raw_text and _apply_raw(circuit, raw=fragment.raw_text,
                                         qubits=local, global_qubits=global_q,
                                         measured=measured):
        return
    sid = fragment.service_id
    if sid == "hadamard":
        for q in local:
            circuit.h(q)
    elif sid == "bell_pair" and len(local) >= 2:
        circuit.h(local[0]); circuit.cx(local[0], local[1])
    elif sid == "cnot" and len(local) >= 2:
        circuit.cx(local[0], local[1])
    elif sid == "cz" and len(local) >= 2:
        circuit.cz(local[0], local[1])
    elif sid == "controlled_unitary" and len(local) >= 2:
        for t in local[1:]:
            if t != local[0]:
                circuit.cx(local[0], t)
    elif sid == "qft" and local:
        circuit.compose(QFTGate(len(local)), qubits=list(local), inplace=True)
    elif sid == "teleportation" and len(local) >= 2:
        circuit.swap(local[0], local[1])
    elif sid == "measurement_feedforward":
        for q in global_q:
            if q not in measured:
                measured.append(q)
    elif sid == "programmable_gate" and local:
        circuit.append(UGate(0.12, 0.34, 0.56), [local[0]])
    # syndrome_extraction, distillation: no-op


def apply_fragments_to_state(
    *,
    fragments: tuple[FragmentDescriptor, ...],
    state: DistributedStateHandoff,
    previous_peer_id: str,
    block_id: str | None = None,
) -> FragmentDispatchOutput:
    sv = _statevector_from_handoff(state)
    measured = list(state.measured_qubits)
    qubit_ids = _handoff_qubit_ids(state)
    g2l = {q: i for i, q in enumerate(qubit_ids)}
    circuit = QuantumCircuit(state.num_qubits)
    for frag in fragments:
        local = tuple(g2l[q] for q in frag.qubits)
        _apply_fragment(circuit, fragment=frag, measured=measured,
                        local=local, global_q=frag.qubits)
    next_sv = sv.evolve(circuit) if circuit.data else sv
    next_state = DistributedStateHandoff(
        num_qubits=state.num_qubits,
        qubit_ids=qubit_ids,
        amplitudes=_serialize_statevector(next_sv),
        measured_qubits=tuple(measured),
        previous_peer_id=previous_peer_id,
    )
    return FragmentDispatchOutput(
        state=next_state,
        block_id=block_id,
        fragment_ids=tuple(f.fragment_id for f in fragments),
        component_qubits=qubit_ids,
        gate_count=len(circuit.data),
        circuit_depth=circuit.depth() or 0,
        state_transfer_bytes=len(next_state.model_dump_json().encode()),
    )
```


- [ ] **Step 4: Write PeerFragmentWorker, LibP2pNetworkThread, and main()**

Append to the same file (after the quantum execution engine):

```python
# ---------------------------------------------------------------------------
# In-memory fragment worker (mirrors libp2p/fragment_worker.py)
# ---------------------------------------------------------------------------

@dataclass
class _Reservation:
    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    service_id: str
    requesting_peer_id: str
    expires_at: datetime
    committed: bool = False


class PeerFragmentWorker:
    def __init__(self, *, peer_id: str, max_slots: int = 4) -> None:
        self._peer_id = peer_id
        self._max_slots = max_slots
        self._reservations: dict[str, _Reservation] = {}
        self._active: set[str] = set()
        self._results: dict[str, ExecutionResultPayload] = {}

    def heartbeat_snapshot(self) -> tuple[int, int]:
        self._purge()
        return len(self._reservations), len(self._active)

    async def handle_prepare(self, payload: bytes) -> bytes:
        req = ReservationPrepareRequest.model_validate_json(payload)
        self._purge()
        existing = self._reservations.get(req.reservation_id)
        if existing:
            t = "committed" if existing.committed else "accepted"
            return ReservationPrepareResponse(
                reservation_id=req.reservation_id,
                accepting_peer_id=self._peer_id,
                transition=t,
            ).model_dump_json().encode()
        if len(self._reservations) + len(self._active) >= self._max_slots:
            return ReservationPrepareResponse(
                reservation_id=req.reservation_id,
                accepting_peer_id=self._peer_id,
                transition="rejected",
                reason="capacity exhausted",
            ).model_dump_json().encode()
        self._reservations[req.reservation_id] = _Reservation(
            reservation_id=req.reservation_id,
            workflow_run_id=req.workflow_run_id,
            fragment_id=req.fragment_id,
            service_id=req.service_id,
            requesting_peer_id=req.requesting_peer_id,
            expires_at=_utc_now() + timedelta(seconds=req.ttl_seconds),
        )
        return ReservationPrepareResponse(
            reservation_id=req.reservation_id,
            accepting_peer_id=self._peer_id,
            transition="accepted",
        ).model_dump_json().encode()

    async def handle_commit(self, payload: bytes) -> bytes:
        req = ReservationCommitRequest.model_validate_json(payload)
        self._purge()
        res = self._reservations.get(req.reservation_id)
        if res is None:
            return ReservationCommitResponse(
                reservation_id=req.reservation_id, transition="rejected"
            ).model_dump_json().encode()
        res.committed = True
        return ReservationCommitResponse(
            reservation_id=req.reservation_id, transition="committed"
        ).model_dump_json().encode()

    async def handle_cancel(self, payload: bytes) -> bytes:
        req = ReservationCancelRequest.model_validate_json(payload)
        self._reservations.pop(req.reservation_id, None)
        return ReservationCancelResponse(
            reservation_id=req.reservation_id, transition="cancelled"
        ).model_dump_json().encode()

    async def handle_dispatch(self, payload: bytes) -> bytes:
        req = FragmentDispatchRequest.model_validate_json(payload)
        cached = self._results.get(req.execution_id)
        if cached:
            return cached.model_dump_json().encode()
        res = self._reservations.get(req.reservation_id)
        if res is None or not res.committed:
            r = ExecutionResultPayload(
                execution_id=req.execution_id,
                fragment_id=req.fragment_id,
                executing_peer_id=self._peer_id,
                transition="failed",
                error_detail="reservation not committed",
            )
            self._results[req.execution_id] = r
            return r.model_dump_json().encode()
        self._active.add(req.execution_id)
        self._reservations.pop(req.reservation_id, None)
        t0 = perf_counter()
        try:
            dispatch_input = FragmentDispatchInput.model_validate(req.input_payload)
            fragments = dispatch_input.fragment_bundle()
            output = await anyio.to_thread.run_sync(
                partial(
                    apply_fragments_to_state,
                    fragments=fragments,
                    state=dispatch_input.state,
                    previous_peer_id=self._peer_id,
                    block_id=dispatch_input.block_id,
                )
            )
            result = ExecutionResultPayload(
                execution_id=req.execution_id,
                fragment_id=req.fragment_id,
                executing_peer_id=self._peer_id,
                transition="completed",
                output_payload=output.model_dump(mode="json"),
                latency_ms=(perf_counter() - t0) * 1000.0,
                fidelity_score=0.95,
            )
        except Exception as exc:
            result = ExecutionResultPayload(
                execution_id=req.execution_id,
                fragment_id=req.fragment_id,
                executing_peer_id=self._peer_id,
                transition="failed",
                error_detail=str(exc)[:600],
                latency_ms=(perf_counter() - t0) * 1000.0,
            )
        finally:
            self._active.discard(req.execution_id)
        self._results[req.execution_id] = result
        return result.model_dump_json().encode()

    def _purge(self) -> None:
        now = _utc_now()
        for rid in [k for k, v in self._reservations.items() if v.expires_at <= now]:
            self._reservations.pop(rid, None)


# ---------------------------------------------------------------------------
# libp2p network thread (mirrors libp2p/transport.py)
# ---------------------------------------------------------------------------

@dataclass
class NodeConfig:
    coordinator: str
    label: str
    port: int
    advertise_addr: str | None
    services: tuple[str, ...]
    max_qubits: int
    namespace: str
    heartbeat_interval: int

    @property
    def advertisement_topic(self) -> str:
        return f"{self.namespace}.peer-advertisement.v1"

    @property
    def heartbeat_topic(self) -> str:
        return f"{self.namespace}.peer-heartbeat.v1"

    def protocol_ids(self) -> dict[str, str]:
        base = f"/qb2/{self.namespace}"
        return {
            "prepare": f"{base}/reservation/prepare/1.0.0",
            "commit": f"{base}/reservation/commit/1.0.0",
            "cancel": f"{base}/reservation/cancel/1.0.0",
            "dispatch": f"{base}/execution/fragment-dispatch/1.0.0",
        }


class QuantumNode:
    def __init__(self, config: NodeConfig) -> None:
        self.config = config
        self.logger = logging.getLogger("QuantumNode")
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._thread: threading.Thread | None = None
        self._trio_token: object | None = None
        self._peer_id: str = ""

    def start(self) -> None:
        self._stop.clear()
        self._ready.clear()
        self._thread = threading.Thread(
            target=trio.run, args=(self._trio_main,), daemon=True, name="libp2p-node"
        )
        self._thread.start()
        if not self._ready.wait(timeout=30.0):
            raise RuntimeError("Node did not become ready in 30s")

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10.0)

    async def _trio_main(self) -> None:
        cfg = self.config
        seed = hashlib.sha256(cfg.label.encode()).digest()
        key_pair = create_new_ed25519_key_pair(seed=seed)

        peerstore_dir = Path.home() / ".quantum-node"
        peerstore_dir.mkdir(parents=True, exist_ok=True)
        safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in cfg.label)

        try:
            from quantum_backend_v2.libp2p.peerstore import create_compatible_sync_sqlite_peerstore
            peerstore = create_compatible_sync_sqlite_peerstore(
                peerstore_dir / f"peerstore-{safe_label}.sqlite3"
            )
            host = new_host(key_pair=key_pair, peerstore_opt=peerstore,
                            listen_addrs=None, bootstrap=None, enable_mDNS=False)
        except Exception:
            host = new_host(key_pair=key_pair, listen_addrs=None,
                            bootstrap=None, enable_mDNS=False)

        gossipsub = GossipSub(
            protocols=[_GOSSIPSUB_PROTOCOL_ID],
            degree=3, degree_low=2, degree_high=4,
            time_to_live=300,
            heartbeat_initial_delay=2.0,
            heartbeat_interval=cfg.heartbeat_interval,
        )
        pubsub = Pubsub(host, gossipsub)

        listen_addrs = [Multiaddr(f"/ip4/0.0.0.0/tcp/{cfg.port}")]

        try:
            async with host.run(listen_addrs=listen_addrs):
                self._trio_token = trio.lowlevel.current_trio_token()
                self._peer_id = str(host.get_id())
                peer_id = self._peer_id

                worker = PeerFragmentWorker(
                    peer_id=peer_id,
                    max_slots=cfg.max_qubits,
                )
                protocols = cfg.protocol_ids()
                handlers = {
                    protocols["prepare"]: worker.handle_prepare,
                    protocols["commit"]: worker.handle_commit,
                    protocols["cancel"]: worker.handle_cancel,
                    protocols["dispatch"]: worker.handle_dispatch,
                }
                for proto_id, handler in handlers.items():
                    host.set_stream_handler(
                        proto_id,
                        self._make_stream_handler(handler),
                    )

                async with background_trio_service(gossipsub):
                    async with background_trio_service(pubsub):
                        await pubsub.wait_until_ready()
                        await trio.sleep(0.2)

                        await self._connect_bootstrap(host)

                        advertised = self._resolve_advertised(host)
                        await self._publish_advertisement(pubsub, peer_id, advertised)

                        self._print_startup_info(peer_id, advertised)
                        self._ready.set()

                        async with trio.open_nursery() as nursery:
                            nursery.start_soon(
                                self._heartbeat_loop, pubsub, peer_id,
                                advertised, worker
                            )
                            nursery.start_soon(self._watch_stop, nursery)
        except Exception:
            self.logger.exception("Node encountered an unhandled exception")
        finally:
            self._ready.clear()
            self._trio_token = None

    def _resolve_advertised(self, host: IHost) -> tuple[str, ...]:
        if self.config.advertise_addr:
            return (self.config.advertise_addr,)
        return tuple(str(a) for a in host.get_addrs())

    def _make_stream_handler(self, handler):
        async def _handle(stream):
            try:
                payload = await stream.read(_STREAM_READ_MAX)
                if not payload:
                    return
                response = await handler(bytes(payload))
                await stream.write(response)
                with suppress(Exception):
                    await stream.close_write()
            except Exception:
                with suppress(Exception):
                    await stream.reset()
                raise
            finally:
                with suppress(Exception):
                    await stream.close()
        return _handle

    async def _connect_bootstrap(self, host: IHost) -> None:
        addr = self.config.coordinator
        peer_info = info_from_p2p_addr(Multiaddr(addr))
        for attempt in range(1, _BOOTSTRAP_RETRIES + 1):
            try:
                await host.connect(peer_info)
                self.logger.info("Connected to coordinator on attempt %d", attempt)
                return
            except Exception:
                if attempt >= _BOOTSTRAP_RETRIES:
                    self.logger.error(
                        "Failed to connect to coordinator after %d attempts. "
                        "Check --coordinator value and network connectivity.",
                        _BOOTSTRAP_RETRIES,
                    )
                    raise
                await trio.sleep(_BOOTSTRAP_RETRY_DELAY)

    async def _publish_advertisement(
        self, pubsub, peer_id: str, advertised: tuple[str, ...]
    ) -> None:
        adv = PeerAdvertisement(
            peer_id=peer_id,
            trust_tier="community",
            network_addresses=advertised,
            supported_protocols=(
                f"/qb2/{self.config.namespace}/peer-exchange/1.0.0",
            ),
            service_summaries=tuple(
                ServiceAdvertisementSummary(
                    service_id=svc,
                    version="1.0.0",
                    quantum_capability=svc,
                    benchmark_mode="quantum_vs_classical",
                )
                for svc in self.config.services
            ),
        )
        try:
            await pubsub.publish(
                self.config.advertisement_topic,
                adv.model_dump_json().encode(),
            )
            self.logger.info("Advertisement published")
        except Exception:
            self.logger.exception("Failed to publish advertisement")

    async def _heartbeat_loop(
        self, pubsub, peer_id: str,
        advertised: tuple[str, ...], worker: PeerFragmentWorker
    ) -> None:
        count = 0
        while True:
            reservations, executions = worker.heartbeat_snapshot()
            hb = PeerHeartbeat(
                peer_id=peer_id,
                health_status="healthy",
                active_reservations=reservations,
                active_executions=executions,
            )
            try:
                await pubsub.publish(
                    self.config.heartbeat_topic,
                    hb.model_dump_json().encode(),
                )
                self.logger.debug("Heartbeat published (res=%d, exec=%d)",
                                  reservations, executions)
            except Exception:
                self.logger.exception("Failed to publish heartbeat")
            count += 1
            if count % _ADVERTISEMENT_EVERY_N_HEARTBEATS == 0:
                await self._publish_advertisement(pubsub, peer_id, advertised)
            await trio.sleep(self.config.heartbeat_interval)

    async def _watch_stop(self, nursery) -> None:
        while not self._stop.is_set():
            await trio.sleep(0.5)
        nursery.cancel_scope.cancel()

    def _print_startup_info(self, peer_id: str, advertised: tuple[str, ...]) -> None:
        addr_str = advertised[0] if advertised else f"/ip4/0.0.0.0/tcp/{self.config.port}"
        print("\n" + "=" * 60)
        print("QUANTUM NODE STARTED")
        print("=" * 60)
        print(f"\n  Peer ID   : {peer_id}")
        print(f"  Label     : {self.config.label}")
        print(f"  Listen    : /ip4/0.0.0.0/tcp/{self.config.port}")
        print(f"  Advertise : {addr_str}")
        print(f"  Services  : {', '.join(self.config.services)}")
        print(f"  Namespace : {self.config.namespace}")
        print("\nTo register this node in the dashboard:")
        print("  1. Open your dashboard at /network/nodes/join")
        print("  2. Your node should appear automatically in ~30s")
        print("  3. If it does not, use the manual registration form with:")
        print(f"       Peer ID : {peer_id}")
        if advertised:
            try:
                ma = Multiaddr(advertised[0])
                parts = str(ma).split("/")
                ip_idx = next((i for i, p in enumerate(parts) if p in ("ip4","ip6")), None)
                port_idx = next((i for i, p in enumerate(parts) if p == "tcp"), None)
                if ip_idx and port_idx:
                    print(f"       Host    : {parts[ip_idx + 1]}")
                    print(f"       Port    : {parts[port_idx + 1]}")
            except Exception:
                print(f"       Addr    : {advertised[0]}")
        print("\n" + "=" * 60 + "\n")


# ---------------------------------------------------------------------------
# CLI and entrypoint
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a real external quantum compute node",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python node-starter-template.py \\
      --coordinator /ip4/1.2.3.4/tcp/4011/p2p/12D3KooW... \\
      --label "My Node" --port 4030

  python node-starter-template.py \\
      --coordinator /ip4/1.2.3.4/tcp/4011/p2p/12D3KooW... \\
      --label "GPU Node" --port 4031 \\
      --advertise-addr /ip4/5.6.7.8/tcp/4031 \\
      --services hadamard cnot bell_pair qft \\
      --max-qubits 16
""",
    )
    parser.add_argument("--coordinator", required=True,
                        help="Coordinator multiaddr e.g. /ip4/1.2.3.4/tcp/4011/p2p/<PEER_ID>")
    parser.add_argument("--label", default="My Quantum Node",
                        help="Node label (also seeds the stable peer ID)")
    parser.add_argument("--port", type=int, default=4030,
                        help="TCP port to listen on (default: 4030)")
    parser.add_argument("--advertise-addr", default=None,
                        help="Public multiaddr to advertise e.g. /ip4/1.2.3.4/tcp/4030")
    parser.add_argument("--services", nargs="+", default=list(_KNOWN_SERVICE_IDS),
                        help="Quantum services to offer (default: all)")
    parser.add_argument("--max-qubits", type=int, default=8,
                        help="Max concurrent execution slots (default: 8)")
    parser.add_argument("--namespace", default="quantum-backend",
                        help="Rendezvous namespace — must match coordinator (default: quantum-backend)")
    parser.add_argument("--heartbeat-interval", type=int, default=60,
                        help="Seconds between heartbeat publishes (default: 60)")
    parser.add_argument("--log-level", default="INFO",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        help="Logging level (default: INFO)")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    unknown = [s for s in args.services if s not in _KNOWN_SERVICE_IDS]
    if unknown:
        print(f"Warning: unknown service IDs will be advertised but may not route: {unknown}")

    config = NodeConfig(
        coordinator=args.coordinator,
        label=args.label,
        port=args.port,
        advertise_addr=args.advertise_addr,
        services=tuple(args.services),
        max_qubits=args.max_qubits,
        namespace=args.namespace,
        heartbeat_interval=args.heartbeat_interval,
    )

    node = QuantumNode(config)

    def _shutdown(sig, frame):
        print("\nShutting down node…")
        node.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    try:
        node.start()
        # Block main thread
        while True:
            time.sleep(1)
    except RuntimeError as exc:
        print(f"Failed to start node: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Verify the script is syntactically valid**
```bash
python3 -m py_compile scripts/node-starter-template.py && echo "Syntax OK"
```
Expected: `Syntax OK`

- [ ] **Step 6: Commit**
```bash
git add scripts/node-starter-template.py scripts/requirements-node.txt
git commit -m "feat(scripts): implement real external quantum worker node

Full py-libp2p node with GossipSub advertisement, PeerHeartbeat loop,
and all 4 execution protocol handlers (prepare/commit/cancel/dispatch).
Inline Qiskit execution engine handles all 11 service types."
```

---

## Task 10: MongoDB Client Helper Check

**Files:**
- Investigate: `frontend/src/lib/` and `frontend/src/features/` for MongoDB access pattern

The `mine/route.ts` in Task 2 calls `getMongoDb()`. This helper may not exist yet.

- [ ] **Step 1: Check for existing MongoDB client**
```bash
grep -r "MongoClient\|getMongoDb\|mongodb" frontend/src/lib/ frontend/src/app/api/ --include="*.ts" -l 2>/dev/null | head -10
```

- [ ] **Step 2: If no helper exists, create frontend/src/lib/mongodb.ts**

```ts
import "server-only";
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? process.env.QB2_MONGODB_REMOTE_URI ?? "";
if (!uri) throw new Error("MONGODB_URI environment variable is not set");

const options = {};
let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getMongoDb(): Promise<Db> {
  const c = await clientPromise;
  const dbName = process.env.MONGODB_DATABASE ?? process.env.QB2_MONGODB_DATABASE ?? "qds";
  return c.db(dbName);
}
```

- [ ] **Step 3: If the codebase already has a MongoDB client, update mine/route.ts to use the existing import pattern instead.**

- [ ] **Step 4: Commit (only if new file was needed)**
```bash
git add frontend/src/lib/mongodb.ts
git commit -m "feat(lib): add getMongoDb helper for direct MongoDB access"
```

---

## Task 11: Linter and Type Check Pass

**Files:** All newly created/modified files

- [ ] **Step 1: Run TypeScript type check**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Fix any errors before proceeding.

- [ ] **Step 2: Run linter**
```bash
cd frontend && npx eslint src/features/network/components/join-page-client.tsx \
  src/features/network/components/my-node-panel.tsx \
  src/features/network/components/my-nodes-button.tsx \
  src/features/network/components/node-appearance-detector.tsx \
  src/features/network/components/nodes-page-client.tsx \
  src/features/network/hooks/use-my-nodes.ts \
  src/app/api/network/nodes/mine/route.ts \
  src/app/api/network/node-script/route.ts 2>&1 | head -40
```
Fix any errors.

- [ ] **Step 3: Verify Python script syntax**
```bash
python3 -m py_compile scripts/node-starter-template.py && echo "OK"
```

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "fix: resolve linter and type errors for node join feature"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §3 Real node script — Task 9
- [x] §3.3 CLI args — Task 9 step 4 (`_parse_args`)
- [x] §3.4 Startup sequence — Task 9 step 4 (`QuantumNode.start` + `_trio_main`)
- [x] §3.5 Wire protocols — Task 9 step 2 (inline Pydantic schemas)
- [x] §3.6 Stream handlers — Task 9 step 4 (`PeerFragmentWorker`)
- [x] §3.7 Quantum execution — Task 9 step 3 (`apply_fragments_to_state`)
- [x] §3.8 Shutdown — Task 9 step 4 (`_shutdown` signal handler)
- [x] §4.1 Join route — Task 6
- [x] §4.3 Prerequisites card — Task 6 step 2
- [x] §4.3 Step guide — Task 6 step 2
- [x] §4.3 Script viewer — Task 6 step 3 (`ScriptViewer`)
- [x] §4.3 Live detector — Task 5 (`NodeAppearanceDetector`)
- [x] §4.3 Manual fallback form — Task 6 step 3 (`RegisterFallbackForm`)
- [x] §4.4 node-script route — Task 3
- [x] §4.4 nodes/mine GET/POST — Task 2
- [x] §5.2 Zero my nodes — Task 8 (`NodesPageClient` renders nothing)
- [x] §5.3 Single my node — Task 8 (`MyNodePanel`)
- [x] §5.4 Multiple my nodes — Task 8 (`MyNodesButton` + dialog)
- [x] §5.5 MongoDB schema — Task 2 (`UserNodeDoc`)
- [x] §6 Error handling — 409 in Task 2, timeout in Task 5, ping error in Task 7
- [x] §7 Breadcrumb — Task 1

**Type consistency:**
- `MyNode` defined in Task 1 (types.ts), used in Tasks 4, 7, 8 — consistent
- `useMyNodes` returns `MyNode[]`, `MyNodePanel` and `MyNodesButton` accept `MyNode` — consistent
- `useRegisterNode` accepts `RegisterNodeRequest` from types.ts — consistent
- `QUERY_KEYS.network.myNodes()` added in Task 1, used in Tasks 4, 5 — consistent
- `API.NETWORK.NODES_MINE` added in Task 1, used in Task 4 — consistent
- `API.NETWORK.NODE_SCRIPT` added in Task 1, used in Task 6 — consistent

---

Plan complete and saved to `docs/superpowers/plans/2026-05-14-decentralised-node-join.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
