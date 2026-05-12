# VAULT — IPFS Integration Progress

**Milestone:** Phase 1 (Circuit Library + Workflow Cloning)  
**Status:** Deferred — design spec exists, implementation not yet started

The design specification for Phase 1 is captured in
[`IPFS_INTEGRATION_STRATEGIC_VISION.md`](IPFS_INTEGRATION_STRATEGIC_VISION.md).

---

## Phase 1 Tasks (Pending)

### Foundation

- [ ] `bun add helia @helia/unixfs @helia/interface blockstore-idb`
- [ ] `features/ipfs/` barrel created (provider, hooks, types, schema, pinata stub)
- [ ] `features/ipfs/lib/helia-init.ts` — createHelia() factory, IndexedDB blockstore
- [ ] `features/ipfs/provider.tsx` — HeliaProvider (next/dynamic, ssr:false)
- [ ] `features/ipfs/hooks.ts` — useHelia(), useIpfsUpload(), useIpfsFetch()
- [ ] `features/ipfs/schema.ts` — Zod schemas for CircuitIPFSRecord + RunIPFSRecord
- [ ] `features/ipfs/lib/local-index.ts` — localStorage CID index
- [ ] `features/ipfs/lib/transformers.ts` — record ↔ UI model converters
- [ ] `features/ipfs/pinata.ts` — STUB (PINATA_ENABLED = false)

### Constants & Navigation

- [ ] `src/constants/routes.ts` — VAULT_* routes
- [ ] `src/constants/navigation.ts` — VAULT rail item
- [ ] `src/constants/breadcrumbs.ts` — VAULT breadcrumb labels

### VAULT Route Group

- [ ] `app/(main)/vault/layout.tsx` — HeliaProvider wrapper
- [ ] `app/(main)/vault/circuits/page.tsx` — Circuit Library (grid, search, filters)
- [ ] `app/(main)/vault/circuits/[cid]/page.tsx` — Circuit detail
- [ ] `app/(main)/vault/runs/page.tsx` — Shared Runs table
- [ ] `app/(main)/vault/runs/[cid]/page.tsx` — Run viewer
- [ ] `app/(main)/vault/my/circuits/page.tsx` — My Published Circuits
- [ ] `app/(main)/vault/my/runs/page.tsx` — My Shared Runs

### Integration Points

- [ ] `/runs/[id]` — "Share to VAULT ↑" button + VaultBadge in meta strip
- [ ] `/network/circuits` — "Publish to VAULT ↑" button + "In VAULT" badge

### Settings

- [ ] `/settings` — VAULT Identity display name field
- [ ] `/settings/integrations` — Pinata stub card (disabled, "Coming soon")

---

## Phase 2 Tasks (Deferred to After Phase 1)

- [ ] Pinata full implementation (API key in settings, pin on publish)
- [ ] Real-Time Execution Observation (pubsub streaming, Live Executions feed)
- [ ] Provenance CID chains + fork graph viewer
- [ ] SharedWorker for multi-tab Helia persistence
- [ ] DHT keyword search for Circuit Library

---

## Status Legend

- [ ] Pending
- [~] In Progress
- [x] Done
- [!] Blocked
