# Frontend V3 Architecture

**Status:** Design Document  
**Last Updated:** 2026-05-02  
**Maintainers:** Core Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architectural Principles](#architectural-principles)
4. [Data Flow](#data-flow)
5. [State Management](#state-management)
6. [Authentication & Authorization](#authentication--authorization)
7. [Multi-Cluster Management](#multi-cluster-management)
8. [API Layer Design](#api-layer-design)
9. [Database Architecture](#database-architecture)
10. [Security Model](#security-model)
11. [Caching Policy](#caching-policy)

---

## Executive Summary

**Frontend V3** is a Next.js-based dashboard for managing decentralized quantum computing clusters with:

- **Centralized Authentication**: User management in frontend MongoDB
- **Decentralized Backend**: Open, unauthenticated quantum clusters (REST API)
- **Multi-Cluster Support**: Dynamic user-configured cluster connections
- **Protocol Flexibility**: REST-first, JSON-RPC stub for future
- **Zero Backend Caching**: Always fetch fresh quantum job data
- **Tiered Access**: Free trial with configurable time limits

**Key Decisions:**

| Decision | Rationale |
|----------|-----------|
| **Auth in Frontend Only** | Backend is decentralized; auth breaks consensus model |
| **MongoDB Only (No Neon)** | NoSQL flexibility for users, sessions, configs |
| **REST + JSON-RPC Stub** | Backend REST-only now; stub client for future migration |
| **NO Data Caching** | Quantum job states change rapidly; always fetch fresh |
| **Server-Side Proxy** | Next.js /api routes validate + forward to clusters |
| **Cluster-Agnostic Frontend** | Frontend knows URLs only; discovers capabilities dynamically |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (Browser)                           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (Next.js 16 + React 19)               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Client Layer                                          │  │
│  │  - Dashboard UI (no caching)                          │  │
│  │  - Cluster selector                                    │  │
│  │  - Auth forms                                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Server Layer (Next.js API Routes)                    │  │
│  │  - /api/auth/*     → User authentication              │  │
│  │  - /api/proxy/*    → Authenticated proxy to clusters  │  │
│  │  - /api/user/*     → User/cluster management          │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Database (MongoDB)                                    │  │
│  │  - users           → Accounts, tiers                   │  │
│  │  - sessions        → Active sessions                   │  │
│  │  - cluster_configs → User cluster URLs                 │  │
│  │  - usage_logs      → API usage tracking                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ↓
        ┌────────────────┴────────────────┐
        ↓                                  ↓
┌──────────────────┐          ┌──────────────────┐
│ Quantum Cluster A│          │ Quantum Cluster B│
│ (Decentralized)  │          │ (Decentralized)  │
│ - NO AUTH        │          │ - NO AUTH        │
│ - REST API       │          │ - REST API       │
└──────────────────┘          └──────────────────┘
```

**System Boundaries:**

- **Frontend**: User auth, UI, cluster config management (MongoDB)
- **Backend Clusters**: Quantum execution, peer mesh (own Postgres + MongoDB)
- **Isolation**: Frontend NEVER accesses backend databases directly

---

## Architectural Principles

### 1. **Cluster-Agnostic Frontend**

Frontend treats backends as **black boxes**:

```
Frontend ONLY knows:
✓ Cluster connection URL
✓ User metadata (name, tags, region)
✓ Transient health status (in-memory)

Frontend does NOT know:
✗ Backend implementation (libp2p, Postgres, MongoDB)
✗ Peer topology, node count
✗ Quantum capabilities (gates, qubits)
✗ Job scheduling internals

All capabilities discovered dynamically:
- GET /api/v1/health
- GET /api/v1/jobs
```

### 2. **Zero Caching Policy**

**CRITICAL:** Quantum job data is NEVER cached.

**Why:**
- Job states change rapidly (QUEUED → RUNNING → COMPLETED)
- Cache invalidation across clusters is complex
- Stale data = poor UX (user sees wrong job status)
- Real-time accuracy > performance

**What's NOT Cached:**
- ❌ Job lists (`GET /api/v1/jobs`)
- ❌ Job details (`GET /api/v1/jobs/:id`)
- ❌ Peer data (`GET /api/v1/discovery/peers`)
- ❌ Circuit results
- ❌ Financial analysis outputs

**What IS Stored (Not Cached):**
- ✅ Cluster configs (user-provided URLs) → localStorage
- ✅ User preferences → MongoDB
- ✅ Session tokens → HttpOnly cookies
- ✅ Health status → in-memory only (discarded on refresh)

**TanStack Query Configuration:**
```typescript
// CORRECT: No stale time, no caching
useQuery({
  queryKey: ['runs', clusterId],
  queryFn: () => fetchJobs(clusterId),
  staleTime: 0,              // Always fetch fresh
  cacheTime: 0,              // Don't cache responses
  refetchOnWindowFocus: true, // Refetch on tab switch
  refetchInterval: 5000       // Poll every 5s for updates
});
```

### 3. **Security Through Proxying**

```
Client → /api/proxy/:clusterId/* (authenticated) → Backend (open)
```

**Benefits:**
- Cluster URLs hidden from client
- Rate limiting at Next.js layer
- SSRF prevention (validate URLs server-side)
- Audit logging

### 4. **Graceful Degradation**

- Cluster offline: Show error banner, retry button
- Auth expired: Redirect to /login
- Network error: Display last error message, manual retry

---

## Data Flow

### Request Flow (No Caching)

```
User clicks "Refresh Runs"
         ↓
React Component
         ↓
TanStack Query (staleTime: 0, cacheTime: 0)
         ↓
ClusterManager.listJobs()
         ↓
GET /api/proxy/:clusterId/api/v1/jobs
         ↓
middleware.ts validates session
         ↓
Proxy route forwards to backend cluster
         ↓
Backend returns fresh job data
         ↓
React re-renders with latest data
```

**Key:** Every request fetches fresh data from backend.

---

## State Management

### State Layers

```
Layer 1: Server State (Next.js API routes)
- User sessions (JWT in cookies)
- MongoDB connections

Layer 2: Client State (Zustand)
- auth-store: User session
- cluster-store: Cluster configs (URLs only)
- NO runs-store (no caching!)

Layer 3: Browser Storage
- localStorage: Encrypted cluster configs
- NO job data stored
```

### Zustand Stores

**Auth Store:**
```typescript
// store/auth-store.ts
type AuthStore = {
  user: User | null;
  isAuthenticated: boolean;
  login: (email, password) => Promise<void>;
  logout: () => Promise<void>;
};
```

**Cluster Store:**
```typescript
// store/cluster-store.ts
type ClusterStore = {
  activeClusterId: string | null;
  clusters: Record<string, ClusterConfig>; // URLs only
  setActiveCluster: (id: string) => void;
  
  // NO health status caching!
  // Health checked live via API on each load
};
```

---

## Authentication & Authorization

### Session Flow

```
1. User signs up
   POST /api/auth/signup
   { email, password, name }
   ↓
2. Server hashes password (bcrypt cost 12)
   Stores in MongoDB
   ↓
3. Generate JWT token
   Set HttpOnly cookie
   ↓
4. Subsequent requests
   middleware.ts validates JWT
   ↓
   Valid? → Continue
   Invalid? → Redirect /login
```

### Free Tier

```bash
# .env.local
FREE_TRIAL_DAYS=14
NODE_ENV=development
DEV_MODE_BYPASS_AUTH=true  # Dev only!
```

**Trial Check:**
```typescript
if (user.tier === 'free' && new Date() > user.freeTrialExpiresAt) {
  return redirect('/upgrade');
}
```

---

## Multi-Cluster Management

### Cluster Config Schema (MongoDB)

```typescript
type ClusterConfig = {
  _id: ObjectId;
  userId: ObjectId;
  clusterId: string;        // User-defined ID
  name: string;
  
  // Connection (ONLY URLs)
  protocol: 'rest' | 'jsonrpc';
  restUrl?: string;
  rpcUrl?: string;
  
  // User metadata (NOT backend details)
  region?: string;
  provider?: string;
  tags: string[];
  color?: string;
  
  // NO backend-specific fields
  // NO health caching in DB
  
  createdAt: Date;
  updatedAt: Date;
};
```

**Health Checks:**
- In-memory only (Zustand, not persisted)
- Checked live on app load
- Polled every 30s while app open
- Discarded on page refresh

---

## API Layer Design

### Routes

**Authentication:**
```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
```

**User Management:**
```
GET    /api/user/profile
GET    /api/user/clusters
POST   /api/user/clusters
DELETE /api/user/clusters/:id
```

**Proxy (Authenticated):**
```
ALL    /api/proxy/:clusterId/*

Examples:
GET    /api/proxy/prod-us/api/v1/jobs      → Fetch fresh jobs
POST   /api/proxy/prod-us/api/v1/circuits/submit
GET    /api/proxy/prod-us/api/v1/health
```

---

## Database Architecture

### MongoDB Collections

**users:**
```typescript
{
  _id: ObjectId,
  email: string,          // Unique
  passwordHash: string,   // Bcrypt cost 12
  name: string,
  tier: 'free' | 'pro' | 'enterprise',
  freeTrialExpiresAt: Date,
  createdAt: Date,
  preferences: {
    theme: 'light' | 'dark',
    defaultClusterId?: string
  }
}
```

**sessions:**
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  token: string,          // Hashed JWT
  expiresAt: Date,        // TTL index
  createdAt: Date,
  userAgent: string,
  ipAddress: string
}
```

**cluster_configs:**
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  clusterId: string,
  name: string,
  protocol: 'rest' | 'jsonrpc',
  restUrl?: string,
  rpcUrl?: string,
  
  // User metadata
  region?: string,
  provider?: string,
  tags: string[],
  
  // NO health status in DB
  // NO backend capabilities
  
  createdAt: Date,
  updatedAt: Date
}
```

---

## Security Model

### Critical Security Measures

**1. Password Security:**
```typescript
// Bcrypt cost 12, password complexity enforced
const PasswordSchema = z.string()
  .min(12)
  .regex(/[A-Z]/, 'Uppercase required')
  .regex(/[a-z]/, 'Lowercase required')
  .regex(/[0-9]/, 'Number required')
  .regex(/[^A-Za-z0-9]/, 'Special char required');
```

**2. JWT Security:**
```typescript
// 256-bit secret, HttpOnly cookies
const JWT_SECRET = process.env.JWT_SECRET; // Min 64 hex chars
if (JWT_SECRET.length < 64) throw new Error('JWT_SECRET too short');

// HttpOnly cookie (NEVER localStorage)
res.cookies.set('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60
});
```

**3. SSRF Prevention:**
```typescript
// Block private IPs
const blockedPatterns = [
  /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/
];

if (blockedPatterns.some(p => p.test(hostname))) {
  throw new Error('Invalid cluster URL');
}

// Enforce HTTPS in production
if (NODE_ENV === 'production' && protocol !== 'https:') {
  throw new Error('HTTPS required');
}
```

**4. Rate Limiting:**
```typescript
// 100 req/min for general API
// 60 req/min for proxy routes
const limiter = new RateLimiter({
  interval: 60 * 1000,
  limit: 100
});
```

**5. Security Headers:**
```typescript
// Strict CSP, HSTS, X-Frame-Options
response.headers.set('Content-Security-Policy',
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval';"
);
response.headers.set('Strict-Transport-Security',
  'max-age=31536000; includeSubDomains'
);
```

**6. Input Validation:**
```typescript
// All inputs validated with Zod
// XSS sanitization
// URL validation with private IP blocking
```

---

## Caching Policy

### What's NEVER Cached

**Backend Quantum Data:**
- ❌ Job lists
- ❌ Job details
- ❌ Circuit results
- ❌ Peer discovery data
- ❌ Financial analysis outputs
- ❌ Runtime metrics

**Rationale:** Job states change in seconds. Caching = stale data = bad UX.

### What's Stored (Not Cached)

**Persistent:**
- ✅ Cluster configs (localStorage, encrypted)
- ✅ User preferences (MongoDB)
- ✅ Session tokens (HttpOnly cookies)

**Transient (In-Memory):**
- ✅ Health status (Zustand, discarded on refresh)
- ✅ Active cluster selection (Zustand)

### TanStack Query Configuration

```typescript
// ALWAYS fetch fresh data
const queryConfig = {
  staleTime: 0,              // Data immediately stale
  cacheTime: 0,              // Don't cache responses
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchInterval: 5000      // Poll every 5s
};
```

---

## Environment Variables

```bash
# Authentication
JWT_SECRET=<64-hex-chars>      # openssl rand -hex 32
JWT_EXPIRES_IN=7d

# Database
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=quantum_frontend

# Free Tier
FREE_TRIAL_DAYS=14
MAX_CLUSTERS_FREE=3
RATE_LIMIT_FREE_RPM=100

# Development
NODE_ENV=production
DEV_MODE_BYPASS_AUTH=false     # NEVER true in production

# Security
HTTPS_ONLY=true
```

---

## Future Extensibility

### JSON-RPC Migration

**Phase 1 (Current):** REST only  
**Phase 2 (Future):** Implement JSON-RPC client when backend adds `/jsonrpc`  
**Phase 3:** Auto-detect protocol per cluster

---

**END OF ARCHITECTURE DOCUMENT**
