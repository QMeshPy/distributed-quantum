# VAULT IPFS Integration — Implementation Plan

**Date:** 2026-05-08
**Spec:** `docs/superpowers/specs/2026-05-08-vault-ipfs-integration-design.md`
**Milestone:** M14 — Phase 1
**Estimate:** ~18–22 hours total across 22 tasks

---

## Phase 0 — Foundation (leaf nodes, no cross-deps)

### Task 1 — Install Helia dependencies
**Estimate:** 0.5h
```bash
cd frontend
bun add helia @helia/unixfs @helia/interface blockstore-idb
```
Done when: `bun build` succeeds, no TS error on empty import from `helia`.

---

### Task 2 — `features/ipfs/types.ts` — IPFS record interfaces
**File:** `frontend/src/features/ipfs/types.ts`
**Estimate:** 1h
- `CircuitIPFSRecord` interface: type:"circuit/v1", cid?, fork_of?, meta{name,description,tags,domain,qubit_count,gate_count,published_at,author_display_name}, circuit{qasm,backend_payload}, fidelity?
- `RunIPFSRecord` interface: type:"run/v1", cid?, fork_of?, meta{run_id,published_at,author_display_name}, circuit_cid?, circuit_inline?, execution{peer_count,fragment_count,runtime_ms,status,peer_ids}, results
- `VaultItem` discriminated union
- `LocalVaultIndex` = { cids: string[]; updatedAt: string }
- `CircuitPublishForm` = { name, description, tags, domain, qasm, backendPayload, qubitCount, gateCount }
- No external imports; pure TypeScript

Done when: file type-checks in isolation.

---

### Task 3 — `features/ipfs/schema.ts` — Zod validators
**File:** `frontend/src/features/ipfs/schema.ts`
**Depends on:** Task 2 (types)
**Estimate:** 1h
- Import `z` from `zod`
- `circuitIPFSRecordSchema` — full validation of CircuitIPFSRecord
- `runIPFSRecordSchema` — full validation of RunIPFSRecord
- Export both schemas; export inferred z.infer types as `ParsedCircuitRecord` and `ParsedRunRecord`

Done when: unit test parses minimal fixtures for both schemas without error.

---

### Task 4 — `features/ipfs/pinata.ts` — Phase 1 stub
**File:** `frontend/src/features/ipfs/pinata.ts`
**Estimate:** 0.25h
```ts
export const PINATA_ENABLED = false;
export const pinToCid = (_cid: string): Promise<void> => {
  throw new Error("Pinata not yet implemented — Phase 2");
};
```
Done when: exported correctly, no lint errors.

---

## Phase 1 — Helia Core

### Task 5 — `features/ipfs/lib/helia-init.ts` — Helia factory + singleton
**File:** `frontend/src/features/ipfs/lib/helia-init.ts`
**Depends on:** Task 1
**Estimate:** 2h
- Import `createHelia` from `helia`; `IDBBlockstore` from `blockstore-idb`
- `export type HeliaNode = Awaited<ReturnType<typeof createHelia>>`
- `async function createHeliaNode(): Promise<HeliaNode>`: opens IDBBlockstore("vault-blockstore"), calls createHelia({ blockstore })
- Module-level singleton: `let _heliaPromise: Promise<HeliaNode> | null = null`
- `export function getHeliaNode(): Promise<HeliaNode>` — creates once, memoizes
- Pure browser code — NO `import "server-only"`, never imported server-side
- Guard: if `typeof indexedDB === "undefined"` throw new Error("Helia requires a browser environment")

Done when: imports without error; `bun build` does not include blockstore-idb in the server bundle.

---

### Task 6 — `features/ipfs/lib/local-index.ts` — localStorage CID registry
**File:** `frontend/src/features/ipfs/lib/local-index.ts`
**Depends on:** Task 2
**Estimate:** 1h
- Constants: `VAULT_INDEX_KEY = "vault:cid_index"`, `VAULT_DISPLAY_NAME_KEY = "vault:display_name"`
- `readLocalIndex(): LocalVaultIndex` — JSON.parse or return `{ cids: [], updatedAt: new Date().toISOString() }`
- `addCidToIndex(cid: string): void`
- `removeCidFromIndex(cid: string): void`
- `getDisplayName(): string`
- `setDisplayName(name: string): void`
- All functions guard `typeof window === "undefined"` for SSR safety (return no-op or empty)

Done when: add → read → remove round-trip works in unit test.

---

### Task 7 — `features/ipfs/lib/transformers.ts` — record ↔ UI model converters
**File:** `frontend/src/features/ipfs/lib/transformers.ts`
**Depends on:** Task 2; imports RunDetail from `@/features/runs`
**Estimate:** 1.5h
- `runDetailToRunIPFSRecord(run: RunDetail, displayName: string): RunIPFSRecord`
  - peer_count = unique nodeIds in fragmentResults
  - runtime_ms = Date.parse(run.updatedAt) - Date.parse(run.createdAt)
  - status = run.status.toUpperCase() as "COMPLETED" | "FAILED"
- `runIPFSRecordToPartialRunDetail(record: RunIPFSRecord): Partial<RunDetail>`
- `circuitIPFSRecordFromForm(form: CircuitPublishForm, displayName: string): CircuitIPFSRecord`

Done when: no `any` types; round-trip test passes.

---

### Task 8 — `features/ipfs/provider.tsx` — HeliaProvider React context
**File:** `frontend/src/features/ipfs/provider.tsx`
**Depends on:** Task 5
**Estimate:** 1.5h
```ts
"use client";
```
- `HeliaContextValue = { node: HeliaNode | null; ready: boolean; error: Error | null }`
- `HeliaContext = createContext<HeliaContextValue | null>(null)`
- `HeliaProvider` component:
  - `useState` for context value, initial: `{ node: null, ready: false, error: null }`
  - `useEffect([], )` — dynamically imports `./lib/helia-init` at runtime: `const { getHeliaNode } = await import("./lib/helia-init")`, then calls `getHeliaNode()`
  - On success: `setState({ node, ready: true, error: null })`
  - On fail: `setState({ node: null, ready: false, error: e as Error })`
  - On unmount cleanup: noop (singleton node lives for browser session)
- `export function useHeliaContext()`: reads context; throws if null
- NOT wrapped in next/dynamic here — the layout does the dynamic wrapping

Done when: provider mounts without SSR crash; ready transitions to true in browser.

---

### Task 9 — `features/ipfs/hooks.ts` — useHelia, useIpfsUpload, useIpfsFetch
**File:** `frontend/src/features/ipfs/hooks.ts`
**Depends on:** Task 5, 6, 8
**Estimate:** 2h
```ts
"use client";
```

**`useHelia()`** — returns `HeliaContextValue`; calls `useHeliaContext()`

**`useIpfsUpload()`**:
- `const { node } = useHelia()`
- `useState<boolean>(false)` for `uploading`
- `upload(data: unknown): Promise<string>`:
  - Set uploading=true
  - Dynamically import `@helia/unixfs` (not at top of file!)
  - `const { unixfs } = await import("@helia/unixfs")`
  - `const fs = unixfs(node)`
  - `const bytes = new TextEncoder().encode(JSON.stringify(data))`
  - `const cid = await fs.addBytes(bytes)`
  - `const cidStr = cid.toString()`
  - Call `addCidToIndex(cidStr)` from local-index
  - Set uploading=false; return cidStr
- Returns `{ upload, uploading }`

**`useIpfsFetch<T>(cid: string | null)`**:
- `const { node, ready } = useHelia()`
- `useState<{ data: T | null; loading: boolean; error: Error | null }>` initial: `{ data: null, loading: false, error: null }`
- `useEffect([cid, ready])`:
  - If !cid or !ready or !node: return
  - Set loading=true
  - AbortController with 10s timeout
  - Dynamically import `@helia/unixfs`; cat the CID bytes; parse JSON
  - On success: setData; on timeout/error: setError
- Returns `{ data, loading, error }`

Done when: useIpfsFetch returns correct parsed data from a mocked Helia node.

---

### Task 10 — `features/ipfs/index.ts` — public barrel
**File:** `frontend/src/features/ipfs/index.ts`
**Depends on:** Tasks 4, 8, 9
**Estimate:** 0.25h
```ts
export { HeliaProvider, useHeliaContext } from "./provider";
export { useHelia, useIpfsUpload, useIpfsFetch } from "./hooks";
export { PINATA_ENABLED, pinToCid } from "./pinata";
export type {
  CircuitIPFSRecord,
  RunIPFSRecord,
  VaultItem,
  LocalVaultIndex,
  CircuitPublishForm,
} from "./types";
```

---

## Phase 2 — Constants & Navigation

### Task 11 — Update `src/constants/routes.ts`
**File:** `frontend/src/constants/routes.ts`
**Estimate:** 0.25h
Insert after `runFragmentFlow` line, before `DOCS`:
```ts
VAULT:              "/vault",
VAULT_CIRCUITS:     "/vault/circuits",
VAULT_RUNS:         "/vault/runs",
VAULT_MY_CIRCUITS:  "/vault/my/circuits",
VAULT_MY_RUNS:      "/vault/my/runs",
vaultRunDetail:     (cid: string) => `/vault/runs/${cid}`     as const,
vaultCircuitDetail: (cid: string) => `/vault/circuits/${cid}` as const,
```

---

### Task 12 — Update `src/constants/navigation.ts`
**File:** `frontend/src/constants/navigation.ts`
**Depends on:** Task 11
**Estimate:** 0.5h
- Add `Vault` to lucide import line
- Insert vault RailItem between "lab" and "settings" entries in NAV_CONFIG:
```ts
{
  id: "vault",
  label: "Vault",
  icon: Vault,
  href: "/vault/circuits",
  hasSidebar: true,
  sidebar: {
    type: "static",
    groups: [
      { heading: "Discover", links: [
          { label: "Circuit Library", href: "/vault/circuits" },
          { label: "Shared Runs",     href: "/vault/runs"     },
        ],
      },
      { heading: "My Vault", links: [
          { label: "My Circuits", href: "/vault/my/circuits" },
          { label: "My Runs",     href: "/vault/my/runs"     },
        ],
      },
    ],
  },
  matchPrefixes: ["/vault"],
},
```

---

### Task 13 — Update `src/constants/breadcrumbs.ts`
**File:** `frontend/src/constants/breadcrumbs.ts`
**Estimate:** 0.25h
BREADCRUMB_LABELS additions:
```ts
vault: "Vault",
my:    "My Vault",
```
RAIL_LABEL_FOR_PREFIX addition:
```ts
"/vault": "Vault",
```

---

### Task 14 — Update `src/constants/query-keys.ts`
**File:** `frontend/src/constants/query-keys.ts`
**Estimate:** 0.25h
Add vault section:
```ts
vault: {
  all:          ()            => ["vault"]                  as const,
  circuitFetch: (cid: string) => ["vault", "circuit", cid] as const,
  runFetch:     (cid: string) => ["vault", "run",     cid] as const,
  myCircuits:   ()            => ["vault", "my-circuits"]  as const,
  myRuns:       ()            => ["vault", "my-runs"]      as const,
},
```

---

## Phase 3 — VAULT Route Group

### Task 15 — `app/(main)/vault/layout.tsx` — HeliaProvider wrapper
**File:** `frontend/src/app/(main)/vault/layout.tsx`
**Depends on:** Task 10
**Estimate:** 0.5h
```tsx
import dynamic from "next/dynamic";

const HeliaProvider = dynamic(
  () => import("@/features/ipfs").then((m) => m.HeliaProvider),
  { ssr: false },
);

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <HeliaProvider>{children}</HeliaProvider>;
}
```
No "use client" — this is a Server Component. The dynamic import handles the boundary.

---

### Task 16 — Circuit Library pages
**New files:**
- `frontend/src/app/(main)/vault/circuits/page.tsx` (shell, ≤10 lines)
- `frontend/src/app/(main)/vault/circuits/[cid]/page.tsx` (shell, ≤10 lines)
- `frontend/src/features/ipfs/components/circuit-library-client.tsx`
- `frontend/src/features/ipfs/components/circuit-detail-client.tsx`
- `frontend/src/features/ipfs/hooks/use-local-vault-index.ts`
**Depends on:** Tasks 10, 11, 12, 14
**Estimate:** 3h

**`use-local-vault-index.ts`** ("use client"):
- Reads `readLocalIndex()` from `local-index.ts`; returns `string[]` of CIDs
- Refreshes on window focus via `useEffect` listener

**`circuit-library-client.tsx`** ("use client"):
- PageHeader: `icon={Vault} label="Vault" title="Circuit Library" glow="orange"`
- PageHeader children: `[Publish Circuit ▶]` button (onClick opens PublishCircuitDrawer — inline dialog component in same file)
- State: `search`, `domainFilter`, `qubitFilter`, `sort` — all useState; filter/sort applied client-side on fetched records
- `useLocalVaultIndex()` → for each CID call `useIpfsFetch<CircuitIPFSRecord>(cid)`
- 3-col grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- `CircuitCard` per item — neutral GlassCard:
  - Name (text-white/80 text-sm font-medium), author (text-white/40 text-xs), domain badge, qubit/gate counts, CID truncated
  - Hover: `hover:ring-orange-500/25 hover:bg-orange-500/[0.04]` transition
  - `[Load into Builder]` → stores circuit in sessionStorage("vault:load_circuit"), pushes to ROUTES.RUNS_NEW
  - `[Fork]` → pre-fills publish drawer with `fork_of = cid`
- `PublishCircuitDrawer` — shadcn Dialog:
  - Fields: name, description, tags (comma-separated), domain select, QASM textarea
  - On submit: calls `upload(circuitIPFSRecordFromForm(form, getDisplayName()))`
  - After success: shows CID + "Share this link" toast

**`circuit-detail-client.tsx`** ("use client"):
- `const { cid } = useParams<{ cid: string }>()`
- `useIpfsFetch<CircuitIPFSRecord>(cid)` drives skeleton/error/content states
- Skeleton: `<DetailPageSkeleton />` from shared/components/detail
- Layout: `PageHeader icon={Vault} label="Vault" title={record.meta.name} glow="orange"`; body uses GlassCard sections
- MetricGrid: qubit_count, gate_count, domain, author, published_at
- Fork badge GlassCard: if record.fork_of, shows GitFork icon + link to `/vault/circuits/${record.fork_of}`
- QASM section: `<pre>` with `overflow-auto max-h-64 font-mono text-[11px] text-white/55`
- CTAs: `[Load into Builder]` + `[Fork]`

---

### Task 17 — Shared Runs pages
**New files:**
- `frontend/src/app/(main)/vault/runs/page.tsx` (shell)
- `frontend/src/app/(main)/vault/runs/[cid]/page.tsx` (shell)
- `frontend/src/features/ipfs/components/vault-runs-client.tsx`
- `frontend/src/features/ipfs/components/vault-run-detail-client.tsx`
**Depends on:** Tasks 10, 11, 12, 14
**Estimate:** 2.5h

**`vault-runs-client.tsx`** ("use client"):
- PageHeader: `icon={Share2} label="Vault" title="Shared Runs" glow="orange"`
- Full-width table (no max-w-*): Author | Qubits | Peers | Fragments | Runtime | Status | CID
- Each row clickable: `router.push(ROUTES.vaultRunDetail(cid))`
- Hover row: `hover:bg-orange-500/8`
- `[Clone & Run]` action: sessionStorage("vault:clone_circuit") = JSON.stringify(record), push to ROUTES.RUNS_NEW
- Reads `useLocalVaultIndex()` + `useIpfsFetch<RunIPFSRecord>` per CID; filters by `type === "run/v1"`

**`vault-run-detail-client.tsx`** ("use client"):
- Public page — no auth check for viewing
- `useIpfsFetch<RunIPFSRecord>(cid)` with loading/error/data handling
- PageHeader: `icon={Share2} label="Vault" title="Shared Run" glow="orange"`
- GlassCard sections mirroring RunDetailPageClient structure:
  - JobMetaStrip equivalent using record.meta fields
  - Execution section (MetricGrid: peers, fragments, runtime_ms, status)
  - Circuit section (QASM readonly pre)
  - Results section (counts/probabilities from record.results — cast carefully, no `any`)
- Fork badge if `record.fork_of` present
- CTA: `[Clone & Run ▶]` — `sessionStorage.setItem("vault:clone_circuit", JSON.stringify(record))` then `router.push(ROUTES.RUNS_NEW)`
- Offline state: GlassCard with yellow warning: "Content unavailable — the original peer may be offline"
- Error state: GlassCard with red error + CID shown

---

### Task 18 — My Vault pages
**New files:**
- `frontend/src/app/(main)/vault/my/circuits/page.tsx` (shell)
- `frontend/src/app/(main)/vault/my/runs/page.tsx` (shell)
- `frontend/src/features/ipfs/components/my-vault-client.tsx`
**Depends on:** Tasks 10, 11, 12, 14
**Estimate:** 1.5h

**`my-vault-client.tsx`** ("use client"):
- Props: `type: "circuits" | "runs"`
- Reads `useLocalVaultIndex()` → fetches all CIDs → filters by record.type
- Table: same columns as vault-runs-client / circuit-library depending on type
- Extra action column: `[Unpublish]` → calls `removeCidFromIndex(cid)` then re-renders (no backend call; content remains on IPFS network)
- Empty state: "No published circuits yet. Use [Publish Circuit ▶] on the Circuit Library."

Both page shells pass `type` prop:
```tsx
// my/circuits/page.tsx
import { MyVaultClient } from "@/features/ipfs/components/my-vault-client";
export default function MyCircuitsPage() { return <MyVaultClient type="circuits" />; }
```

---

## Phase 4 — Integration Points

### Task 19 — Run Detail: "Share to VAULT" + VaultBadge
**File MODIFIED:** `frontend/src/features/runs/components/run-detail-page-client.tsx`
**New file:** `frontend/src/features/ipfs/components/share-to-vault-button.tsx`
**Depends on:** Tasks 9, 7
**Estimate:** 2h

**`share-to-vault-button.tsx`** ("use client"):
- Props: `run: RunDetail`
- Internal `useState<string | null>(null)` for `sharedCid`
- `const { upload, uploading } = useIpfsUpload()` (lazy — no Helia init until click)
- `const displayName = getDisplayName()` (from local-index)
- On click: `const cid = await upload(runDetailToRunIPFSRecord(run, displayName)); setSharedCid(cid)`
- Before share state: button with Upload icon, text "Share to VAULT", orange variant:
  `border-orange-500/25 bg-orange-500/8 text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/15`
- Uploading state: spinner + "Uploading…"
- After share: two-part button group: `[✓ In VAULT]` (static) + `[Copy link]` (copies window.location.origin + ROUTES.vaultRunDetail(cid) to clipboard)
- VaultBadge: exported separately as `VaultBadge({ cid }: { cid: string })` — small pill linking to ROUTES.vaultRunDetail(cid)

**Modification to `run-detail-page-client.tsx`:**
1. Dynamic import ShareToVaultButton: `const ShareToVaultButton = dynamic(() => import("@/features/ipfs/components/share-to-vault-button").then(m => m.ShareToVaultButton), { ssr: false })`
2. Add to PageHeader children: `<ShareToVaultButton run={run} />`
3. Inside RunDetailPanel, when sharedCid is known (lifted to parent or via event):
   - Add to JobMetaStrip `extraBadges`: `{ label: "VAULT · " + cid.slice(0,8) + "…", className: "border-orange-500/30 bg-orange-500/10 text-orange-400 cursor-pointer" }`
   - Note: to avoid prop drilling, ShareToVaultButton manages its own state; VaultBadge is rendered inside the button component itself and positioned via a portal or inline after the button

---

### Task 20 — Settings integrations: Pinata stub card
**File MODIFIED:** `frontend/src/app/(main)/settings/integrations/page.tsx`
**Depends on:** Task 4 (PINATA_ENABLED constant)
**Estimate:** 0.5h
- Add to INTEGRATIONS array:
  ```ts
  {
    name: "Pinata",
    description: "Long-term circuit pinning via Pinata IPFS gateway. Coming soon — Phase 2.",
    status: "coming soon",
  }
  ```
- Render with Badge variant="outline" text-muted-foreground; card opacity-60 to signal disabled state

---

### Task 21 — Settings general: VAULT display name field
**New file:** `frontend/src/features/ipfs/components/vault-display-name-field.tsx`
**File MODIFIED:** `frontend/src/app/(main)/settings/page.tsx`
**Depends on:** Task 6
**Estimate:** 1h

**`vault-display-name-field.tsx`** ("use client"):
- On mount: `useState` initialized from `getDisplayName()`; if empty, from Better Auth session user.name via `useSession()` from `@/features/auth`
- Label: "VAULT Identity"; description: "Display name shown on your published circuits and shared runs."
- Text input: `className="h-11 w-full rounded-sm border border-hairline bg-canvas px-4 text-sm text-ink placeholder:text-muted focus:border-info-border focus:outline-none"`
- Save button (primary near-black pill): calls `setDisplayName(value)` + shows inline "Saved" confirmation for 2s
- `max-w-sm` input width to match form system

**Modification to `settings/page.tsx`:**
- Add `import { VaultDisplayNameField } from "@/features/ipfs/components/vault-display-name-field"` (use next/dynamic + ssr:false since it reads localStorage)
- Insert `<VaultDisplayNameField />` inside the `max-w-2xl flex flex-col gap-6` wrapper after `<ApiKeysPanel />`
- Add `<h2>` section separator: "VAULT Identity" with same text-2xl font-normal style

---

### Task 22 — Network Circuits: "Publish to VAULT" button stub
**File MODIFIED:** `frontend/src/app/(main)/network/circuits/page.tsx`
**New file:** `frontend/src/features/ipfs/components/publish-circuit-button.tsx`
**Depends on:** Tasks 9, 10
**Estimate:** 1h

**`publish-circuit-button.tsx`** ("use client"):
- Props: `circuit: CircuitPublishForm | null`
- `const { upload, uploading } = useIpfsUpload()`
- If circuit is null: disabled button with tooltip "Select a circuit first"
- On click: `const cid = await upload(circuitIPFSRecordFromForm(circuit, getDisplayName())); setSharedCid(cid)`
- After publish: shows `GlassCard` badge: `🔒 In VAULT · [link]` → ROUTES.vaultCircuitDetail(cid)

**Modification to `network/circuits/page.tsx`:**
- Add dynamic import of PublishCircuitButton (ssr:false)
- Place after the existing placeholder card content
- Phase 1: passes `circuit={null}` (disabled state) until circuit builder is connected in Phase 2

---

## Dependency Graph

```
Task 1 (bun add)
     └──> Task 5 (helia-init)
               └──> Task 8 (provider)
                         └──> Task 9 (hooks)
                                   └──> Task 10 (barrel)
                                             └──> Task 15 (layout)
                                                       └──> Tasks 16,17,18 (pages)

Task 2 (types)
     ├──> Task 3 (schema)
     ├──> Task 6 (local-index) ──> Task 9, Task 21
     └──> Task 7 (transformers) ──> Task 19

Task 4 (pinata stub) ──> Task 10, Task 20

Tasks 11-14 (constants) ──> Tasks 12-18

Tasks 19, 20, 21, 22 (integrations) depend on Tasks 9, 6, 7, 10
```

## Parallelism Strategy

**Round 1** (all independent): Tasks 1, 2, 4, 11, 14
**Round 2** (after R1): Tasks 3, 5, 6, 7, 12, 13
**Round 3** (after R2): Task 8; Task 20; Tasks 19 partial
**Round 4** (after R3): Task 9
**Round 5** (after R4): Task 10, Task 15, Task 21, Task 22
**Round 6** (after R5): Tasks 16, 17, 18, Task 19 (final integration)

---

## Verification Checklist (applies to every task)

- [ ] No raw `fetch` in `useEffect` — data fetching via TanStack Query or `useIpfsFetch`
- [ ] No magic strings — all routes from `ROUTES.*`, API paths from `API.*`
- [ ] No `any` — TypeScript strict throughout
- [ ] `import "server-only"` absent from all browser files
- [ ] Design tokens used — no inline hex or px values
- [ ] Heavy libs wrapped: `next/dynamic` + `ssr: false` for HeliaProvider, ShareToVaultButton, PublishCircuitButton, VaultDisplayNameField
- [ ] All page.tsx files ≤10 lines (shell only)
- [ ] `bun lint` passes on every changed file

---

## Phase 7 — Pinata Full Integration (Phase 2)

> Prerequisite: all Phase 1 tasks complete. `PINATA_ENABLED = false` stub replaced with real implementation.
> **Estimate:** ~10–12 hours across 8 tasks.

---

### Task P1 — Pinata SDK install
**Estimate:** 0.25h

```bash
cd frontend
bun add pinata
```

Done when: `bun build` succeeds with no TS error.

---

### Task P2 — Settings: Pinata API key storage
**File MODIFIED:** `frontend/src/app/(main)/settings/integrations/page.tsx`
**New file:** `frontend/src/features/ipfs/components/pinata-settings-card.tsx`
**Estimate:** 1.5h

**`pinata-settings-card.tsx`** ("use client"):
- Reads/writes Pinata JWT to `localStorage` key `vault:pinata_jwt`
- Two fields: "Pinata JWT" (password input, masked) + optional "Gateway domain" (e.g. `myapp.mypinata.cloud`)
- Save button: on save, calls `verifyPinataJwt(jwt)` (see Task P3) → shows inline success ("Connected") or error ("Invalid JWT")
- Disconnect button: clears localStorage key, resets state
- Design tokens: `GlassCard` container, `h-11 rounded-sm border border-hairline bg-canvas` inputs, primary near-black Save pill, `text-emerald-400` for Connected badge, `text-red-400` for error

**Modification to `settings/integrations/page.tsx`:**
- Remove "Coming soon" disabled state from Pinata card
- Replace with `<PinataSettingsCard />` (dynamic import, ssr:false)

---

### Task P3 — `features/ipfs/pinata.ts` — real implementation
**File MODIFIED:** `frontend/src/features/ipfs/pinata.ts`
**Estimate:** 2h

Replace the stub with full implementation:

```typescript
// features/ipfs/pinata.ts
export const PINATA_ENABLED = true; // runtime check via getPinataJwt() !== null

export function getPinataJwt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vault:pinata_jwt");
}

export function getPinataGateway(): string {
  if (typeof window === "undefined") return "https://gateway.pinata.cloud";
  return localStorage.getItem("vault:pinata_gateway") ?? "https://gateway.pinata.cloud";
}

// Verifies the JWT is valid by calling Pinata's /data/testAuthentication
export async function verifyPinataJwt(jwt: string): Promise<boolean>;

// Pins a CID via Pinata's pinByHash endpoint
export async function pinToCid(cid: string): Promise<void>;

// Unpins a CID from Pinata
export async function unpinFromCid(cid: string): Promise<void>;

// Lists all CIDs pinned by this account
export async function listPinnedCids(): Promise<string[]>;

// Uploads bytes directly to Pinata (returns IPFS CID)
// Used as fallback when Helia P2P unavailable
export async function uploadToPinata(
  bytes: Uint8Array,
  name: string
): Promise<string>;
```

All functions throw `PinataError` (custom error class with `code: "auth_failed" | "pin_failed" | "network_error"`) on failure.

No backend involvement — all calls go **browser → Pinata API** directly.

---

### Task P4 — `useIpfsUpload` hook: Pinata pin-after-upload
**File MODIFIED:** `frontend/src/features/ipfs/hooks.ts`
**Estimate:** 1h

Modify `useIpfsUpload.upload()` to accept an optional `options: { pinToPinata?: boolean }` parameter:

```typescript
export function useIpfsUpload(): {
  upload: (data: unknown, options?: { pinToPinata?: boolean }) => Promise<string>;
  uploading: boolean;
  pinning: boolean; // separate state for Pinata pin-after-upload
};
```

After successful Helia upload:
1. If `options.pinToPinata === true` AND `getPinataJwt() !== null`: call `pinToCid(cid)` asynchronously (non-blocking, fire-and-forget with error toast on failure)
2. `pinning` state is true while the Pinata call is in flight
3. Error from Pinata does **not** fail the overall upload — CID is already on the IPFS network

---

### Task P5 — `ShareToVaultButton`: Pinata pin toggle
**File MODIFIED:** `frontend/src/features/ipfs/components/share-to-vault-button.tsx`
**Estimate:** 1h

After a run is shared (CID exists):
- Show a secondary `[📌 Pin for permanence]` button (only if `getPinataJwt() !== null`)
- On click: calls `pinToCid(cid)` → shows "Pinned ✓" inline or error toast
- Pinned state persisted in `localStorage` under `vault:pinned_cids` (Set of CID strings)
- If already pinned: shows `[📌 Pinned]` (disabled, emerald color)

---

### Task P6 — `PublishCircuitButton`: Pinata pin toggle
**File MODIFIED:** `frontend/src/features/ipfs/components/publish-circuit-button.tsx`
**Estimate:** 0.75h

Same pattern as Task P5 — after circuit is published, show `[📌 Pin for permanence]` button when Pinata is configured. Mirror the exact state/UI from `ShareToVaultButton`.

---

### Task P7 — `useIpfsFetch` hook: Pinata gateway fallback
**File MODIFIED:** `frontend/src/features/ipfs/hooks.ts`
**Estimate:** 1.5h

When the 10s Helia P2P timeout fires, before showing the "Content unavailable" error, attempt a fallback:

```
1. Check if getPinataJwt() !== null AND getPinataGateway() is set
2. If yes: fetch `${getPinataGateway()}/ipfs/${cid}` via standard fetch()
3. On 200: parse bytes → Zod validate → setData(record) — success
4. On failure: setError("Content unavailable — peer offline and not pinned")
```

This means content pinned to Pinata remains accessible even when the original creator's browser is offline.

---

### Task P8 — My Vault pages: pinned status column + bulk pin
**Files MODIFIED:** `frontend/src/features/ipfs/components/my-vault-client.tsx`
**Estimate:** 1.5h

Add to the My Circuits and My Runs tables:
- New column: **"Pinata"** — shows `📌 Pinned` (emerald badge) or `[Pin ↑]` button (only visible when Pinata is configured)
- Bulk action: checkbox select + `[Pin selected]` button in table header
- Bulk unpin: `[Unpin selected]` (calls `unpinFromCid` for each)
- On mount: calls `listPinnedCids()` to sync pinned state from Pinata account (cached in TanStack Query, `QUERY_KEYS.vault.pinnedCids`, 5min stale time)

---

## Pinata Dependency Graph

```
Task P1 (bun add pinata)
    └──> Task P3 (pinata.ts implementation)
              ├──> Task P4 (upload hook pinning)
              │         ├──> Task P5 (ShareToVaultButton pin toggle)
              │         └──> Task P6 (PublishCircuitButton pin toggle)
              ├──> Task P7 (fetch hook gateway fallback)
              └──> Task P8 (My Vault pinned status)

Task P2 (settings card) ──> Task P3 (reads the JWT set by P2)
```

## Pinata Parallelism

**Round P-1:** Task P1 + Task P2 (independent)
**Round P-2:** Task P3 (depends on P1)
**Round P-3:** Tasks P4, P7 in parallel (both depend on P3)
**Round P-4:** Tasks P5, P6, P8 in parallel (all depend on P4/P3)

---

## Pinata Verification Checklist

- [ ] No Pinata JWT ever sent to the backend — all calls are browser → `api.pinata.cloud` directly
- [ ] `getPinataJwt()` SSR-guards `typeof window` — never throws on server
- [ ] Pinata failure never blocks or fails the primary Helia upload
- [ ] Gateway fallback fires only after Helia timeout — Helia P2P is always attempted first
- [ ] `listPinnedCids()` result cached via TanStack Query, not re-fetched on every render
- [ ] `vault:pinata_jwt` excluded from any logging, error reporting, or analytics
- [ ] All new components use `next/dynamic` + `ssr:false` (they read localStorage)
- [ ] `bun lint` passes on all modified files
