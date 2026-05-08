# VAULT — NFT.Storage Free Pinning Integration

**Date:** 2026-05-08  
**Status:** Approved — Ready for Implementation  
**Replaces:** Previous Pinata-focused VAULT specs  
**Type:** Design + Implementation Spec (Single Document)

---

## Executive Summary

This document consolidates the complete design and implementation plan for integrating **NFT.Storage** as the free IPFS pinning service for the VAULT feature.

**Key Decisions:**
- NFT.Storage chosen for its permanence focus, free tier, and no credit card requirement
- Architecture designed for multi-provider extensibility but ships NFT.Storage only (Phase 1)
- MongoDB stores pinning audit trail, frontend connects directly to both MongoDB and NFT.Storage
- Backend remains quantum-execution only — never touches VAULT
- Phase 2 deferred: Pinata "bring your own API key" + provider plugin system

---

## 1. Architecture

### System Boundaries

```
┌─────────────────────────────────────────────────────┐
│           User's Browser (per-user property)         │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │         Next.js Frontend                      │   │
│  │                                               │   │
│  │  features/ipfs/                               │   │
│  │    ├── lib/helia-init.ts     (P2P network)   │   │
│  │    └── lib/local-index.ts    (CID registry)  │   │
│  │                                               │   │
│  │  features/vault-pinning/     (NEW)           │   │
│  │    ├── types.ts              (multi-service) │   │
│  │    ├── services/             (Phase 1: NFT)  │   │
│  │    │   └── nft-storage.ts                    │   │
│  │    ├── hooks/                                 │   │
│  │    │   ├── use-pin.ts                        │   │
│  │    │   ├── use-quota.ts                      │   │
│  │    │   └── use-pin-metadata.ts               │   │
│  │    └── components/                            │   │
│  │        ├── pin-button.tsx                     │   │
│  │        ├── quota-display.tsx                  │   │
│  │        ├── pin-status-badge.tsx               │   │
│  │        └── unpin-modal.tsx                    │   │
│  └──────────────────────────────────────────────┘   │
│         │                                             │
│         ├─→ Helia (IndexedDB, P2P)                   │
│         ├─→ NFT.Storage API (HTTPS, direct)          │
│         └─→ MongoDB (HTTPS, direct connection)       │
└─────────────────────────────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────────┐
│  MongoDB Atlas (pinning metadata only)             │
│  Collection: vault_pin_audit                       │
│  { userId, cid, service, action, size, timestamp } │
└────────────────────────────────────────────────────┘
                 │
                 ↓ (no connection)
┌────────────────────────────────────────────────────┐
│  Backend (FastAPI + libp2p)                        │
│  Quantum execution ONLY — never touches VAULT      │
└────────────────────────────────────────────────────┘
```

### Core Principle

**Frontend owns VAULT entirely.**  
- Frontend → MongoDB: pinning audit trail  
- Frontend → NFT.Storage: pin/unpin/quota APIs  
- Frontend → Helia: local IPFS P2P node  
- Backend: quantum execution only, zero VAULT involvement  

### Phase Strategy

**Phase 1 (this document):**
- NFT.Storage integration only
- Multi-service UI/schema designed but hidden
- Pin button with dropdown (shows only NFT.Storage initially)
- Quota tracking across VAULT pages
- MongoDB audit trail with full history

**Phase 2 (future, deferred):**
- Add `services/pinata.ts` provider
- Reveal multi-service dropdown in UI
- Settings: "Bring your own API key" section
- Provider plugin architecture for community extensions

**Design Principle:** *Design for extensibility, implement for speed.*

---

## 2. Data Models

### 2.1 MongoDB Schema

**Collection:** `vault_pin_audit`

```typescript
{
  _id: ObjectId,
  userId: string,              // Better Auth user ID (required)
  cid: string,                 // IPFS content identifier
  service: "nft.storage" | "pinata" | string,  // extensible enum
  action: "pin" | "unpin" | "migrate",
  size: number,                // bytes (estimated then updated with actual)
  sizeSource: "estimated" | "actual",
  type: "circuit" | "run",     // content type
  metadata: {                  // snapshot for audit trail
    name?: string,
    description?: string,
    qubit_count?: number,
    gate_count?: number,
    // ... circuit/run specific fields
  },
  timestamp: Date,             // when action occurred
  syncStatus: "pending" | "synced" | "failed",
  error?: string               // if syncStatus = "failed"
}
```

**Indexes:**
```javascript
// Primary queries
db.vault_pin_audit.createIndex({ userId: 1, timestamp: -1 });
db.vault_pin_audit.createIndex({ userId: 1, cid: 1, service: 1 });

// Background sync job
db.vault_pin_audit.createIndex({ syncStatus: 1, timestamp: 1 });

// Quota aggregation
db.vault_pin_audit.createIndex({ userId: 1, service: 1, action: 1 });
```

**Quota Calculation Query:**
```javascript
// Aggregate user's current pinned items by service
db.vault_pin_audit.aggregate([
  { $match: { userId: "user_123" } },
  { $sort: { timestamp: -1 } },
  { $group: {
      _id: { cid: "$cid", service: "$service" },
      lastAction: { $first: "$action" },
      size: { $first: "$size" }
    }
  },
  { $match: { lastAction: "pin" } },  // filter out unpinned
  { $group: {
      _id: "$_id.service",
      totalSize: { $sum: "$size" },
      itemCount: { $sum: 1 }
    }
  }
])
```

---

### 2.2 TypeScript Types

**File:** `features/vault-pinning/types.ts`

```typescript
// Extensible service enum
export type PinningService = "nft.storage" | "pinata";

// Provider interface (all services must implement)
export interface PinningProvider {
  name: PinningService;
  displayName: string;
  
  pin(cid: string): Promise<PinResult>;
  unpin(cid: string): Promise<void>;
  getQuota(): Promise<QuotaInfo>;
  testAuth(): Promise<boolean>;
}

export interface PinResult {
  cid: string;
  size: number;          // actual size from service API
  pinnedAt: Date;
}

export interface QuotaInfo {
  used: number;          // bytes used
  total: number | null;  // bytes total (null = unlimited)
  itemCount: number;     // number of pinned items
}

export interface PinAuditRecord {
  userId: string;
  cid: string;
  service: PinningService;
  action: "pin" | "unpin" | "migrate";
  size: number;
  sizeSource: "estimated" | "actual";
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
  timestamp: Date;
  syncStatus: "pending" | "synced" | "failed";
  error?: string;
}

export interface PinMetadata {
  cid: string;
  service: PinningService;
  pinnedAt: Date;
  size: number;
}

// UI state types
export interface PinButtonState {
  status: "unpinned" | "pinning" | "pinned" | "error";
  service?: PinningService;
  size?: number;
  error?: string;
}

export interface UnpinModalOptions {
  cid: string;
  service: PinningService;
  onConfirm: (hardDelete: boolean) => Promise<void>;
}
```

---

### 2.3 localStorage Fallback

**Key:** `vault:pin_queue`

```typescript
{
  pending: [
    {
      cid: "bafybeig...",
      service: "nft.storage",
      action: "pin",
      size: 1234,
      timestamp: "2026-05-08T10:30:00Z"
    }
  ]
}
```

Used when MongoDB is unreachable — queued actions sync when connection restored.

---

## 3. Core Flows

### 3.1 Pin Flow

**Trigger:** User clicks "📌 Pin ▼" button

**Steps:**

1. **UI State:** Show dropdown with available services
   - Phase 1: Only "NFT.Storage (free) ✓" visible
   - Last-used service marked with checkmark
   
2. **User Selects Service:** (Phase 1: auto-selected NFT.Storage)

3. **Size Estimation:**
   ```typescript
   const estimatedSize = new TextEncoder().encode(
     JSON.stringify(circuitOrRunRecord)
   ).length;
   ```

4. **MongoDB Write (Pending):**
   ```typescript
   await db.vault_pin_audit.insertOne({
     userId: session.user.id,
     cid,
     service: "nft.storage",
     action: "pin",
     size: estimatedSize,
     sizeSource: "estimated",
     type: "circuit",
     metadata: { name: "...", ... },
     timestamp: new Date(),
     syncStatus: "pending"
   });
   ```

5. **Call NFT.Storage API:**
   ```typescript
   const result = await nftStorageProvider.pin(cid);
   // result.size = actual size from service
   ```

6. **MongoDB Update (Synced):**
   ```typescript
   await db.vault_pin_audit.updateOne(
     { userId, cid, service: "nft.storage", timestamp: ... },
     {
       $set: {
         size: result.size,
         sizeSource: "actual",
         syncStatus: "synced"
       }
     }
   );
   ```

7. **UI Update:**
   - Button → "📌 Pinned to NFT.Storage" (green badge)
   - Show success toast: "Pinned to NFT.Storage (1.2 MB)"

**Error Handling:**

| Error | Behavior |
|-------|----------|
| MongoDB unreachable (step 4) | Show modal: "Tracking unavailable. Pin anyway (local-only) or cancel?" → If proceed, queue in localStorage |
| NFT.Storage API fails (step 5) | Show error toast + retry button, MongoDB record stays `syncStatus: "failed"` |
| MongoDB update fails (step 6) | Soft-fail: content is pinned, show warning "Pinned but tracking unavailable" |

---

### 3.2 Unpin Flow

**Trigger:** User clicks unpin icon in "My Vault" table or detail page

**Steps:**

1. **Show Unpin Modal:**
   ```
   Unpin from NFT.Storage?
   
   ○ Remove from tracking only
      Content stays pinned, hidden from your vault
   
   ○ Delete from NFT.Storage and free quota
      Permanently removes content from pinning service
   
   [Cancel] [Confirm]
   ```

2. **User Chooses:**

   **Option A: Soft Delete (tracking only)**
   ```typescript
   await db.vault_pin_audit.insertOne({
     userId,
     cid,
     service: "nft.storage",
     action: "unpin",
     size: 0,  // no size change
     timestamp: new Date(),
     syncStatus: "synced"
   });
   ```
   Content remains on NFT.Storage, just hidden from user's vault.

   **Option B: Hard Delete (free quota)**
   ```typescript
   // Call service API
   await nftStorageProvider.unpin(cid);
   
   // Record in MongoDB
   await db.vault_pin_audit.insertOne({
     userId,
     cid,
     service: "nft.storage",
     action: "unpin",
     size: previousSize,  // freed bytes
     timestamp: new Date(),
     syncStatus: "synced"
   });
   ```

3. **UI Update:**
   - Remove from "My Vault" table
   - Show toast: "Unpinned from NFT.Storage" or "Freed 1.2 MB quota"

---

### 3.3 Quota Tracking Flow

**Trigger:** User loads VAULT page or Settings > VAULT Identity

**Steps:**

1. **Check Cache Freshness:**
   ```typescript
   const lastSync = await getLastQuotaSync(userId, "nft.storage");
   const isStale = Date.now() - lastSync > 5 * 60 * 1000; // 5 min
   ```

2. **If Stale, Sync from Service:**
   ```typescript
   // Call NFT.Storage API
   const quotaInfo = await nftStorageProvider.getQuota();
   
   // Also aggregate from MongoDB for accuracy
   const dbQuota = await aggregateUserQuota(userId, "nft.storage");
   
   // Reconcile differences (service is source of truth)
   if (quotaInfo.used !== dbQuota.totalSize) {
     // Log discrepancy for debugging
     console.warn("Quota mismatch", { service: quotaInfo.used, db: dbQuota.totalSize });
   }
   ```

3. **Display from Cache:**
   ```typescript
   // Show in UI
   <QuotaDisplay
     service="nft.storage"
     used={quotaInfo.used}
     total={quotaInfo.total}
     itemCount={quotaInfo.itemCount}
     lastSynced={lastSync}
   />
   ```

**Sync Triggers:**
- Page load (if cache >5min old)
- After pin/unpin action (real-time)
- User clicks "Refresh" button in Settings

---

### 3.4 Service Failure Handling

#### NFT.Storage API Down

**Scenario:** `nftStorageProvider.pin(cid)` throws network error or 503

**Behavior:**
1. Show error toast: "Free pinning service unavailable. Content remains on Helia P2P network."
2. MongoDB record: `syncStatus: "failed"`, `error: "Service unavailable"`
3. Display "Retry" button
4. Content is still accessible via Helia (P2P) — just not permanently pinned

**Recovery:**
- User clicks retry → re-attempts NFT.Storage API
- Background job retries failed pins every 15 minutes

---

#### MongoDB Down

**Scenario:** MongoDB connection fails during pin action

**Behavior:**
1. Show modal:
   ```
   Tracking unavailable
   
   Your pinning history won't sync across devices until
   connection is restored.
   
   ○ Pin anyway (local-only until sync)
   ○ Cancel and try later
   ```

2. If user proceeds:
   - Pin to NFT.Storage succeeds
   - Action queued in `localStorage` → `vault:pin_queue`
   - Show warning badge: "⚠️ Offline tracking"

3. Background sync job:
   - Polls MongoDB every 30s
   - When restored, drains localStorage queue → MongoDB
   - Removes warning badge

---

## 4. UI Components

### 4.1 PinButton Component

**File:** `features/vault-pinning/components/pin-button.tsx`

**Props:**
```typescript
interface PinButtonProps {
  cid: string;
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
  variant?: "default" | "compact";  // compact for table rows
}
```

**States:**

| State | UI | Behavior |
|-------|-----|----------|
| Unpinned | "📌 Pin ▼" button (neutral) | Click opens dropdown |
| Pinning | "Pinning..." + spinner | Disabled, shows progress |
| Pinned | "📌 Pinned to NFT.Storage" (green badge) | Click opens unpin modal |
| Error | "📌 Pin failed" (red) + tooltip | Click retries |

**Dropdown (Phase 1):**
```
┌─────────────────────────────┐
│ ✓ NFT.Storage (free)        │  ← checkmark = last used
└─────────────────────────────┘
```

**Phase 2 (future):**
```
┌─────────────────────────────┐
│ ✓ NFT.Storage (free)        │
│   Pinata (your key)         │
│   [+ Add service...]        │
└─────────────────────────────┘
```

**Design Tokens:**
- Unpinned: `border-hairline bg-canvas text-ink hover:border-info-border`
- Pinning: `border-info-border bg-info-background text-info`
- Pinned: `border-emerald-500/30 bg-emerald-500/10 text-emerald-400`
- Error: `border-red-500/30 bg-red-500/10 text-red-400`

---

### 4.2 QuotaDisplay Component

**File:** `features/vault-pinning/components/quota-display.tsx`

**Props:**
```typescript
interface QuotaDisplayProps {
  service: PinningService;
  variant: "settings" | "header" | "tooltip";
}
```

**Variant: Settings (full card)**
```
┌─────────────────────────────────────────────┐
│ NFT.Storage                      [Refresh]  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 245 MB used   │
│ 3 circuits, 1 run pinned                    │
│ Last synced: 2 minutes ago                  │
└─────────────────────────────────────────────┘
```

Design:
- GlassCard container
- Progress bar: `h-2 rounded-full bg-canvas-border` with `bg-emerald-500` fill
- Usage text: `text-sm text-muted`
- Refresh button: `text-xs text-info hover:underline`

**Variant: Header (compact chip)**
```
📌 245 MB / ∞
```
- Shown in VAULT page headers
- Clickable → opens Settings > VAULT Identity
- Design: `px-2 py-1 rounded-full border border-hairline bg-canvas-subtle text-xs text-muted`

**Variant: Tooltip (on pin button hover)**
```
NFT.Storage (free)
245 MB used • 4 items
[Unlimited quota]
```
- Rendered via Radix UI Tooltip
- Design: `bg-popover text-popover-foreground p-2 rounded-sm text-xs`

---

### 4.3 PinStatusBadge Component

**File:** `features/vault-pinning/components/pin-status-badge.tsx`

**Props:**
```typescript
interface PinStatusBadgeProps {
  cid: string;
  variant?: "default" | "compact";
}
```

**Usage:** In "My Vault" tables and detail pages

**Display:**
```
📌 NFT.Storage
```

**Behavior:**
- Hover: tooltip shows pinned date + size
  ```
  Pinned on May 8, 2026
  Size: 1.2 MB
  ```
- Click: opens unpin modal
- Design: `px-2 py-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs cursor-pointer hover:bg-emerald-500/15`

---

### 4.4 UnpinModal Component

**File:** `features/vault-pinning/components/unpin-modal.tsx`

**Props:**
```typescript
interface UnpinModalProps {
  cid: string;
  service: PinningService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Layout:**
```
┌────────────────────────────────────────────┐
│ Unpin from NFT.Storage?                    │
│                                            │
│ ○ Remove from tracking only                │
│   Content stays pinned, hidden from your   │
│   vault                                    │
│                                            │
│ ○ Delete from NFT.Storage and free quota  │
│   Permanently removes content from         │
│   pinning service                          │
│                                            │
│              [Cancel]  [Confirm]           │
└────────────────────────────────────────────┘
```

**Implementation:**
- Uses shadcn/ui `Dialog` + `RadioGroup`
- Default selection: "Remove from tracking only" (safer)
- Confirm button disabled until user selects an option
- On confirm: calls `usePin().unpin(cid, { hardDelete })` hook

---

## 5. Hooks

### 5.1 usePin Hook

**File:** `features/vault-pinning/hooks/use-pin.ts`

```typescript
export function usePin() {
  const [pinning, setPinning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const pin = async (
    cid: string,
    type: "circuit" | "run",
    metadata: Record<string, unknown>,
    service: PinningService = "nft.storage"
  ): Promise<void> => {
    setPinning(true);
    setError(null);
    
    try {
      // 1. Estimate size
      const estimatedSize = estimateSize(metadata);
      
      // 2. Write to MongoDB (pending)
      await writePinAudit({
        cid,
        service,
        action: "pin",
        size: estimatedSize,
        sizeSource: "estimated",
        type,
        metadata,
        syncStatus: "pending"
      });
      
      // 3. Call service provider
      const provider = getProvider(service);
      const result = await provider.pin(cid);
      
      // 4. Update MongoDB (synced)
      await updatePinAudit(cid, service, {
        size: result.size,
        sizeSource: "actual",
        syncStatus: "synced"
      });
      
      // 5. Invalidate quota cache
      queryClient.invalidateQueries(["vault-quota", service]);
      
    } catch (err) {
      setError(err as Error);
      
      // MongoDB unreachable? Queue in localStorage
      if (err.code === "MONGODB_UNREACHABLE") {
        queuePinAction(cid, service, "pin");
      }
      
      throw err;
    } finally {
      setPinning(false);
    }
  };
  
  const unpin = async (
    cid: string,
    service: PinningService,
    options: { hardDelete: boolean }
  ): Promise<void> => {
    // Similar structure to pin()
    // If hardDelete: call provider.unpin()
    // Always write audit record
  };
  
  return { pin, unpin, pinning, error };
}
```

---

### 5.2 useQuota Hook

**File:** `features/vault-pinning/hooks/use-quota.ts`

```typescript
export function useQuota(service: PinningService) {
  return useQuery({
    queryKey: ["vault-quota", service],
    queryFn: async () => {
      // 1. Check MongoDB cache freshness
      const lastSync = await getLastQuotaSync(service);
      const isStale = Date.now() - lastSync > 5 * 60 * 1000;
      
      if (isStale) {
        // 2. Fetch from service API
        const provider = getProvider(service);
        const quotaInfo = await provider.getQuota();
        
        // 3. Update MongoDB cache
        await updateQuotaCache(service, quotaInfo);
        
        return quotaInfo;
      }
      
      // 4. Return from MongoDB cache
      return await getQuotaFromCache(service);
    },
    staleTime: 5 * 60 * 1000,  // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

---

### 5.3 usePinMetadata Hook

**File:** `features/vault-pinning/hooks/use-pin-metadata.ts`

```typescript
export function usePinMetadata(cid: string) {
  return useQuery({
    queryKey: ["vault-pin-metadata", cid],
    queryFn: async () => {
      // Query MongoDB for latest pin action for this CID
      const latestAction = await db.vault_pin_audit.findOne(
        { cid, userId: session.user.id },
        { sort: { timestamp: -1 } }
      );
      
      if (!latestAction || latestAction.action === "unpin") {
        return null;  // Not pinned
      }
      
      return {
        cid,
        service: latestAction.service,
        pinnedAt: latestAction.timestamp,
        size: latestAction.size,
      } as PinMetadata;
    },
    staleTime: 1 * 60 * 1000,  // 1 minute
  });
}
```

---

## 6. NFT.Storage Provider Implementation

**File:** `features/vault-pinning/services/nft-storage.ts`

```typescript
import { PinningProvider, PinResult, QuotaInfo } from "../types";

class NFTStorageProvider implements PinningProvider {
  name = "nft.storage" as const;
  displayName = "NFT.Storage";
  
  private apiToken: string | null = null;
  private baseUrl = "https://api.nft.storage";
  
  constructor() {
    // API token stored in environment variable (public, rate-limited)
    this.apiToken = process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN || null;
  }
  
  async pin(cid: string): Promise<PinResult> {
    if (!this.apiToken) {
      throw new Error("NFT.Storage API token not configured");
    }
    
    const response = await fetch(`${this.baseUrl}/pins/${cid}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cid,
        name: `vault-${cid.slice(0, 8)}`,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`NFT.Storage pin failed: ${error.message}`);
    }
    
    const data = await response.json();
    
    return {
      cid: data.cid,
      size: data.size || 0,
      pinnedAt: new Date(data.created),
    };
  }
  
  async unpin(cid: string): Promise<void> {
    if (!this.apiToken) {
      throw new Error("NFT.Storage API token not configured");
    }
    
    const response = await fetch(`${this.baseUrl}/pins/${cid}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
      },
    });
    
    if (!response.ok && response.status !== 404) {
      throw new Error("NFT.Storage unpin failed");
    }
  }
  
  async getQuota(): Promise<QuotaInfo> {
    if (!this.apiToken) {
      throw new Error("NFT.Storage API token not configured");
    }
    
    const response = await fetch(`${this.baseUrl}/user/account`, {
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch NFT.Storage quota");
    }
    
    const data = await response.json();
    
    return {
      used: data.storage_used || 0,
      total: null,  // NFT.Storage free tier is unlimited
      itemCount: data.pin_count || 0,
    };
  }
  
  async testAuth(): Promise<boolean> {
    try {
      await this.getQuota();
      return true;
    } catch {
      return false;
    }
  }
}

export const nftStorageProvider = new NFTStorageProvider();
```

**Provider Registry:**

**File:** `features/vault-pinning/services/index.ts`

```typescript
import { PinningProvider, PinningService } from "../types";
import { nftStorageProvider } from "./nft-storage";

const providers = new Map<PinningService, PinningProvider>([
  ["nft.storage", nftStorageProvider],
  // Phase 2: ["pinata", pinataProvider],
]);

export function getProvider(service: PinningService): PinningProvider {
  const provider = providers.get(service);
  if (!provider) {
    throw new Error(`Unknown pinning service: ${service}`);
  }
  return provider;
}

export function getAllProviders(): PinningProvider[] {
  return Array.from(providers.values());
}
```

---

## 7. Integration Points

### 7.1 Modified Files

#### `features/ipfs/components/share-to-vault-button.tsx`

**Current behavior:** After uploading to IPFS, shows Pinata stub button (Phase 2 placeholder)

**New behavior:** Replace Pinata logic with `<PinButton>` component

```tsx
// Before (Phase 2 Pinata stub)
{sharedCid && (
  <button onClick={() => pinToPinata(sharedCid)}>
    📌 Pin for permanence
  </button>
)}

// After (NFT.Storage integration)
{sharedCid && (
  <PinButton
    cid={sharedCid}
    type="run"
    metadata={{
      name: run.meta.name,
      run_id: run.id,
      // ... other run metadata
    }}
  />
)}
```

---

#### `app/(main)/vault/my/circuits/page.tsx` & `my/runs/page.tsx`

**Add column:** "Pin Status"

```tsx
<DataTable
  columns={[
    // ... existing columns
    {
      id: "pinStatus",
      header: "Pin Status",
      cell: ({ row }) => (
        <PinStatusBadge cid={row.original.cid} />
      ),
    },
  ]}
/>
```

**Add bulk actions:**
- Select rows → "Unpin selected" button in table header
- Opens batch unpin modal (same UI as single unpin, but for multiple items)

---

#### `app/(main)/settings/page.tsx` — VAULT Identity section

**Add after display name field:**

```tsx
{/* Quota Display */}
<div className="space-y-2">
  <h3 className="text-sm font-medium text-ink">Storage Quota</h3>
  <QuotaDisplay service="nft.storage" variant="settings" />
</div>

{/* Phase 2 Placeholder (disabled) */}
<div className="space-y-2 opacity-60">
  <h3 className="text-sm font-medium text-muted">
    Bring Your Own API Key
  </h3>
  <p className="text-xs text-muted">
    Coming soon — connect Pinata or other pinning services
  </p>
</div>
```

---

#### `app/(main)/vault/layout.tsx`

**Wrap in PinningProvider:**

```tsx
import dynamic from "next/dynamic";

const HeliaProvider = dynamic(
  () => import("@/features/ipfs").then((m) => m.HeliaProvider),
  { ssr: false },
);

const PinningProvider = dynamic(
  () => import("@/features/vault-pinning").then((m) => m.PinningProvider),
  { ssr: false },
);

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <HeliaProvider>
      <PinningProvider>
        {children}
      </PinningProvider>
    </HeliaProvider>
  );
}
```

---

#### VAULT Page Headers (circuits, runs, my-circuits, my-runs)

**Add quota chip to PageHeader:**

```tsx
<PageHeader
  icon={Vault}
  label="Vault"
  title="Circuit Library"
  glow="orange"
>
  <QuotaDisplay service="nft.storage" variant="header" />
  {/* ... other header actions */}
</PageHeader>
```

---

### 7.2 New Files to Create

```
features/vault-pinning/
├── index.ts                          # Barrel exports
├── types.ts                          # PinningProvider interface, types
├── provider.tsx                      # PinningProvider React context
│
├── services/
│   ├── nft-storage.ts                # NFT.Storage implementation
│   └── index.ts                      # Provider registry
│
├── hooks/
│   ├── use-pin.ts                    # pin/unpin actions
│   ├── use-quota.ts                  # quota fetching + caching
│   └── use-pin-metadata.ts           # fetch pin status for CID
│
├── components/
│   ├── pin-button.tsx                # Main pin UI
│   ├── quota-display.tsx             # Quota visualization
│   ├── pin-status-badge.tsx          # "📌 Service" badges
│   └── unpin-modal.tsx               # Soft vs hard delete choice
│
└── lib/
    ├── mongodb.ts                    # MongoDB connection helper (reuse existing)
    ├── sync-queue.ts                 # localStorage queue for offline
    ├── estimate-size.ts              # JSON size estimation utility
    └── quota-cache.ts                # MongoDB quota cache helpers
```

---

## 8. Error Handling & Edge Cases

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| **NFT.Storage returns 429 (rate limit)** | Show "Service busy, retry in 60s" toast | Auto-retry after 60s cooldown |
| **NFT.Storage returns 507 (storage full)** | Show "Free quota exhausted" + link to Settings | Prompt user to add own API key (Phase 2) |
| **CID already pinned** | Show "Already pinned to NFT.Storage" (no-op) | No action needed |
| **Unpin CID not found on service** | Soft-fail: remove from MongoDB, show warning toast | Manual cleanup, no blocking error |
| **MongoDB write fails during pin** | Queue in localStorage + show "⚠️ Offline tracking" badge | Background sync job retries every 30s |
| **User deletes localStorage** | Sync from MongoDB on next page load | No data loss (MongoDB is source of truth) |
| **Service returns size = 0** | Use estimated size, flag in MongoDB: `sizeSource: "estimated"` | Manual review in admin dashboard |
| **Multiple tabs open** | Each tab manages own pin state, MongoDB syncs across tabs | Use BroadcastChannel API to notify other tabs |
| **User not authenticated** | Pin button disabled, tooltip: "Sign in to pin" | Redirect to login |
| **NFT.Storage account suspended** | All pins fail with 403, show "Service unavailable" | Contact support or switch to Phase 2 BYOK |

---

## 9. Testing Strategy

### 9.1 Unit Tests

**File:** `features/vault-pinning/services/nft-storage.test.ts`

```typescript
describe("NFTStorageProvider", () => {
  it("should pin CID successfully", async () => {
    // Mock fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cid: "bafybeig...", size: 1234 }),
    });
    
    const result = await nftStorageProvider.pin("bafybeig...");
    
    expect(result.cid).toBe("bafybeig...");
    expect(result.size).toBe(1234);
  });
  
  it("should handle rate limiting", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: "Rate limit exceeded" }),
    });
    
    await expect(nftStorageProvider.pin("bafybeig..."))
      .rejects.toThrow("Rate limit exceeded");
  });
});
```

---

### 9.2 Integration Tests

**File:** `features/vault-pinning/hooks/use-pin.test.tsx`

```typescript
describe("usePin", () => {
  it("should pin and update MongoDB", async () => {
    const { result } = renderHook(() => usePin());
    
    await act(async () => {
      await result.current.pin("bafybeig...", "circuit", { name: "Test" });
    });
    
    // Verify MongoDB audit record created
    const audit = await db.vault_pin_audit.findOne({ cid: "bafybeig..." });
    expect(audit.syncStatus).toBe("synced");
    expect(audit.action).toBe("pin");
  });
  
  it("should queue to localStorage when MongoDB down", async () => {
    // Mock MongoDB failure
    vi.spyOn(db, "insertOne").mockRejectedValue(new Error("MongoDB unreachable"));
    
    const { result } = renderHook(() => usePin());
    
    await act(async () => {
      await result.current.pin("bafybeig...", "circuit", { name: "Test" });
    });
    
    // Verify queued in localStorage
    const queue = JSON.parse(localStorage.getItem("vault:pin_queue")!);
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0].cid).toBe("bafybeig...");
  });
});
```

---

### 9.3 E2E Tests (Playwright)

**File:** `e2e/vault-pinning.spec.ts`

```typescript
test("should pin circuit from Circuit Library", async ({ page }) => {
  await page.goto("/vault/circuits");
  
  // Click first circuit card
  await page.click("[data-testid='circuit-card-0']");
  
  // Click pin button
  await page.click("[data-testid='pin-button']");
  
  // Select NFT.Storage from dropdown
  await page.click("text=NFT.Storage (free)");
  
  // Wait for success toast
  await expect(page.locator("text=Pinned to NFT.Storage")).toBeVisible();
  
  // Verify badge appears
  await expect(page.locator("text=📌 NFT.Storage")).toBeVisible();
});

test("should unpin circuit with quota freeing", async ({ page }) => {
  await page.goto("/vault/my/circuits");
  
  // Click unpin icon on first row
  await page.click("[data-testid='unpin-button-0']");
  
  // Select hard delete option
  await page.click("text=Delete from NFT.Storage and free quota");
  
  // Confirm
  await page.click("button:has-text('Confirm')");
  
  // Wait for success toast
  await expect(page.locator("text=Freed")).toBeVisible();
  
  // Verify row removed from table
  await expect(page.locator("[data-testid='circuit-row-0']")).not.toBeVisible();
});
```

---

## 10. Dependencies

### 10.1 npm Packages

```bash
# No new dependencies needed!
# NFT.Storage uses standard fetch API
# MongoDB connection via existing setup
```

### 10.2 Environment Variables

**File:** `frontend/.env.local`

```bash
# NFT.Storage API token (public, rate-limited)
NEXT_PUBLIC_NFT_STORAGE_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# MongoDB connection (existing)
MONGODB_URI=mongodb+srv://...
```

**Security Note:**
- `NEXT_PUBLIC_NFT_STORAGE_TOKEN` is intentionally public-facing
- Rate-limited by NFT.Storage per token (not per user)
- If abused, rotate token via NFT.Storage dashboard
- For production, consider backend proxy for token (future optimization)

---

## 11. Performance Considerations

### 11.1 Quota Query Optimization

**Problem:** Aggregating user's quota from MongoDB on every page load is expensive

**Solution:** Cache quota in separate MongoDB collection

```typescript
// Collection: vault_quota_cache
{
  userId: string,
  service: "nft.storage",
  used: number,
  itemCount: number,
  lastSynced: Date,
}

// TTL index: auto-delete after 10 minutes
db.vault_quota_cache.createIndex({ lastSynced: 1 }, { expireAfterSeconds: 600 });
```

**Read flow:**
1. Check `vault_quota_cache` first
2. If cache miss or stale: aggregate from `vault_pin_audit` + call service API
3. Write back to cache

**Write flow:**
- On pin/unpin: invalidate cache for user+service
- Let next read flow rebuild cache

---

### 11.2 Bundle Size

**Problem:** NFT.Storage service shouldn't bloat the main bundle

**Solution:** Dynamic imports everywhere

```tsx
// ❌ Bad: loads on every page
import { nftStorageProvider } from "@/features/vault-pinning/services";

// ✅ Good: loads only when needed
const { nftStorageProvider } = await import("@/features/vault-pinning/services");
```

**Enforcement:** Add to ESLint config

```javascript
// .eslintrc.js
rules: {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["**/vault-pinning/**"],
          message: "Dynamically import vault-pinning to avoid bundle bloat",
        },
      ],
    },
  ],
}
```

---

### 11.3 MongoDB Connection Pooling

**Problem:** Each pin action creates new MongoDB connection

**Solution:** Reuse existing connection pool from `lib/mongodb.ts`

```typescript
// lib/mongodb.ts (existing file)
let cachedClient: MongoClient | null = null;

export async function connectToDatabase() {
  if (cachedClient) return cachedClient;
  
  cachedClient = await MongoClient.connect(process.env.MONGODB_URI!);
  return cachedClient;
}
```

**Usage in vault-pinning:**

```typescript
// features/vault-pinning/lib/mongodb.ts
import { connectToDatabase } from "@/lib/mongodb";

export async function writePinAudit(record: PinAuditRecord) {
  const client = await connectToDatabase();
  const db = client.db("quantum-vault");
  await db.collection("vault_pin_audit").insertOne(record);
}
```

---

## 12. Monitoring & Observability

### 12.1 Metrics to Track

| Metric | Purpose | Alert Threshold |
|--------|---------|-----------------|
| Pin success rate | Detect NFT.Storage outages | <95% over 5 min |
| Average pin latency | Monitor service performance | >10s p95 |
| MongoDB sync queue depth | Detect connection issues | >100 pending |
| Quota cache hit rate | Optimize performance | <80% |
| Failed pin retries | Track retry effectiveness | >50 in 10 min |

**Implementation:**

```typescript
// features/vault-pinning/lib/metrics.ts
export async function trackPinMetric(
  action: "pin" | "unpin",
  service: PinningService,
  success: boolean,
  latencyMs: number
) {
  // Send to analytics service (e.g., PostHog, Mixpanel)
  await analytics.track("vault_pin_action", {
    action,
    service,
    success,
    latencyMs,
    userId: session.user.id,
  });
}
```

---

### 12.2 Error Logging

**Sentry integration:**

```typescript
// features/vault-pinning/services/nft-storage.ts
import * as Sentry from "@sentry/nextjs";

async pin(cid: string): Promise<PinResult> {
  try {
    // ... pin logic
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        service: "nft.storage",
        action: "pin",
        cid: cid.slice(0, 8),  // truncated for privacy
      },
      level: "error",
    });
    throw error;
  }
}
```

---

## 13. Migration Path to Phase 2

When ready to add Pinata (or other services), follow these steps:

### 13.1 Add Pinata Provider

**New file:** `features/vault-pinning/services/pinata.ts`

```typescript
class PinataProvider implements PinningProvider {
  name = "pinata" as const;
  displayName = "Pinata";
  
  private apiKey: string | null = null;
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
  }
  
  async pin(cid: string): Promise<PinResult> {
    // Pinata-specific implementation
  }
  
  // ... other methods
}

export const createPinataProvider = (apiKey: string) => new PinataProvider(apiKey);
```

**Update registry:**

```typescript
// features/vault-pinning/services/index.ts
import { createPinataProvider } from "./pinata";

export function getProvider(service: PinningService, apiKey?: string): PinningProvider {
  switch (service) {
    case "nft.storage":
      return nftStorageProvider;
    case "pinata":
      if (!apiKey) throw new Error("Pinata requires API key");
      return createPinataProvider(apiKey);
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}
```

---

### 13.2 Update Settings UI

**Add to `app/(main)/settings/page.tsx`:**

```tsx
<div className="space-y-4">
  <h3 className="text-sm font-medium text-ink">
    Bring Your Own API Key
  </h3>
  
  {/* Pinata */}
  <div className="space-y-2">
    <label htmlFor="pinata-key" className="text-xs text-muted">
      Pinata JWT
    </label>
    <input
      id="pinata-key"
      type="password"
      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
      className="h-11 w-full rounded-sm border border-hairline bg-canvas px-4 text-sm"
    />
    <button onClick={handlePinataTest}>Test Connection</button>
  </div>
  
  {/* Future: Filebase, Thirdweb, etc. */}
</div>
```

---

### 13.3 Reveal Multi-Service Dropdown

**Update `PinButton` component:**

```tsx
// Phase 1: hardcoded single option
const availableServices = ["nft.storage"];

// Phase 2: dynamic based on user config
const availableServices = [
  "nft.storage",
  ...(hasPinataKey ? ["pinata"] : []),
];
```

---

### 13.4 Data Migration

**No migration needed!** MongoDB schema already supports `service` field as extensible enum.

Existing records:
```json
{ "service": "nft.storage", ... }
```

New records:
```json
{ "service": "pinata", ... }
```

Both coexist in same collection.

---

## 14. Acceptance Criteria

### Phase 1 Complete When:

- [ ] User can click "📌 Pin" on circuit/run and pin to NFT.Storage
- [ ] Pin button shows "Pinned to NFT.Storage" after success
- [ ] "My Vault" tables show pin status badges
- [ ] Settings page displays NFT.Storage quota with usage bar
- [ ] VAULT page headers show compact quota chip
- [ ] Unpin modal offers soft vs hard delete
- [ ] MongoDB audit trail records all pin/unpin actions
- [ ] localStorage queue handles offline pinning
- [ ] NFT.Storage failures show retry button
- [ ] Quota refreshes on page load if stale (>5min)
- [ ] All tests pass (unit, integration, E2E)
- [ ] Bundle size impact <50KB gzipped

---

## 15. Out of Scope (Deferred)

| Feature | Reason | Future Phase |
|---------|--------|--------------|
| Pinata integration | User demand unclear | Phase 2 |
| Provider plugin system | Premature abstraction | Phase 3 |
| Multi-service bulk actions | Complex UX | Phase 2 |
| Pin migration between services | Low priority | Phase 3 |
| Admin dashboard for quota monitoring | Backend involvement | Phase 4 |
| Webhook notifications for pin events | Backend required | Phase 4 |
| IPFS pubsub for real-time updates | Deferred from original spec | Phase 5+ |

---

## 16. Implementation Checklist

### Pre-Implementation
- [ ] Review this spec with team
- [ ] Confirm NFT.Storage API token works
- [ ] Verify MongoDB connection string
- [ ] Set up monitoring/analytics hooks

### Phase 1 Implementation (Estimated: 18-22 hours)
- [ ] Create `features/vault-pinning/` directory structure
- [ ] Implement `types.ts` (PinningProvider interface)
- [ ] Implement `services/nft-storage.ts` provider
- [ ] Implement `hooks/use-pin.ts` hook
- [ ] Implement `hooks/use-quota.ts` hook
- [ ] Implement `hooks/use-pin-metadata.ts` hook
- [ ] Implement `components/pin-button.tsx`
- [ ] Implement `components/quota-display.tsx`
- [ ] Implement `components/pin-status-badge.tsx`
- [ ] Implement `components/unpin-modal.tsx`
- [ ] Implement `lib/sync-queue.ts` (localStorage)
- [ ] Implement `lib/estimate-size.ts` utility
- [ ] Implement `lib/quota-cache.ts` helpers
- [ ] Update `app/(main)/vault/layout.tsx` with PinningProvider
- [ ] Update `features/ipfs/components/share-to-vault-button.tsx`
- [ ] Update `app/(main)/vault/my/circuits/page.tsx` (add pin column)
- [ ] Update `app/(main)/vault/my/runs/page.tsx` (add pin column)
- [ ] Update `app/(main)/settings/page.tsx` (add quota display)
- [ ] Add quota chips to VAULT page headers
- [ ] Write unit tests for NFT.Storage provider
- [ ] Write integration tests for usePin hook
- [ ] Write E2E tests for pin/unpin flows
- [ ] Update `.env.example` with `NEXT_PUBLIC_NFT_STORAGE_TOKEN`
- [ ] Create MongoDB indexes for `vault_pin_audit` collection
- [ ] Add ESLint rule for dynamic imports
- [ ] Performance testing (bundle size, query latency)
- [ ] Documentation: update README with pinning feature

### Post-Implementation
- [ ] Deploy to staging
- [ ] Manual QA: pin/unpin flows
- [ ] Manual QA: quota tracking across pages
- [ ] Manual QA: offline pinning (disable network, test queue)
- [ ] Monitor Sentry for errors (first 24h)
- [ ] Monitor analytics for adoption metrics
- [ ] User feedback collection
- [ ] Performance review (MongoDB query times)

---

## 17. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pin success rate | >95% | Analytics events |
| Average pin latency | <5s | Performance monitoring |
| User adoption (% of vault users who pin) | >30% after 2 weeks | Analytics funnel |
| Quota cache hit rate | >85% | Custom metric |
| Zero data loss (MongoDB audit integrity) | 100% | Audit queries |

---

## 18. Appendix

### 18.1 NFT.Storage API Reference

**Base URL:** `https://api.nft.storage`

**Authentication:** Bearer token in `Authorization` header

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/pins/{cid}` | Pin CID to service |
| DELETE | `/pins/{cid}` | Unpin CID from service |
| GET | `/user/account` | Get user quota |
| GET | `/pins` | List user's pins |

**Rate Limits:**
- Free tier: 100 requests/hour
- Burst: 10 requests/minute

**Documentation:** https://nft.storage/docs/reference/http-api/

---

### 18.2 MongoDB Collection Schema

```javascript
// Database: quantum-vault
// Collection: vault_pin_audit

{
  _id: ObjectId("..."),
  userId: "user_2abc123",
  cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  service: "nft.storage",
  action: "pin",
  size: 1234567,
  sizeSource: "actual",
  type: "circuit",
  metadata: {
    name: "Grover's Search",
    qubit_count: 4,
    gate_count: 12,
  },
  timestamp: ISODate("2026-05-08T10:30:00Z"),
  syncStatus: "synced",
}

// Indexes
vault_pin_audit.userId_timestamp_desc  // { userId: 1, timestamp: -1 }
vault_pin_audit.userId_cid_service     // { userId: 1, cid: 1, service: 1 }
vault_pin_audit.syncStatus_timestamp   // { syncStatus: 1, timestamp: 1 }
vault_pin_audit.userId_service_action  // { userId: 1, service: 1, action: 1 }
```

---

### 18.3 Design Tokens Reference

**Color Palette (Pinning UI):**

```typescript
// Unpinned state
border: "hsl(var(--hairline))",
background: "hsl(var(--canvas))",
text: "hsl(var(--ink))",

// Pinning state
border: "hsl(var(--info-border))",
background: "hsl(var(--info-background))",
text: "hsl(var(--info))",

// Pinned state (success)
border: "hsl(142 76% 36% / 0.3)",  // emerald-500/30
background: "hsl(142 76% 36% / 0.1)",  // emerald-500/10
text: "hsl(142 76% 36%)",  // emerald-400

// Error state
border: "hsl(0 84% 60% / 0.3)",  // red-500/30
background: "hsl(0 84% 60% / 0.1)",  // red-500/10
text: "hsl(0 84% 60%)",  // red-400
```

---

## 19. Next Steps

After this spec is approved:

1. **Create implementation plan** → Use `/superpowers:writing-plans` skill
2. **Break into tasks** → 22 discrete tasks matching checklist
3. **Begin Phase 1 development** → Start with types.ts and provider implementation
4. **Iterative testing** → Test each component as it's built
5. **Phase 1 deployment** → Ship NFT.Storage integration
6. **Gather feedback** → Observe user behavior for 2-4 weeks
7. **Plan Phase 2** → Based on demand for BYOK feature

---

**END OF SPECIFICATION**

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-08  
**Author:** Claude + User (brainstorming session)  
**Reviewers:** [Pending]  
**Status:** Ready for Implementation
