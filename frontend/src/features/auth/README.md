# Authentication Feature

Authentication in QuantumMesh Distributed Services is powered by **Better Auth** with the **MongoDB** adapter, supporting two complementary sign-in methods:

1. **Email OTP** (`better-auth/plugins` `emailOTP`): Frictionless passwordless authentication via single-use numeric codes sent via Resend.
2. **Sign-In with Ethereum (EIP-4361 / SIWE)** (`better-auth/plugins` `siwe`): Cryptographic wallet-based authentication, address verification, and profile linking.

---

## Architecture & Workflows

### 1. Sign-In with Ethereum (EIP-4361)

```
[Browser / Web3 Wallet]                        [Next.js Server]                   [MongoDB]
        │                                              │                              │
        │── 1. POST /api/auth/siwe/nonce ─────────────▶│                              │
        │                                              │── Store single-use nonce ───▶│
        │◀─ 2. Return { nonce } ───────────────────────│                              │
        │                                              │                              │
        │   3. Prompt user for personal_sign           │                              │
        │      (EIP-4361 formatted message)           │                              │
        │                                              │                              │
        │── 4. POST /api/auth/siwe/verify ────────────▶│                              │
        │      { message, signature }                  │── Consume nonce (atomic) ───▶│ (Replay rejected!)
        │                                              │── Verify secp256k1 signature │
        │                                              │── Validate domain & chain ID │
        │                                              │── Check/create user & wallet │
        │◀─ 5. Set HTTP-only session cookie ───────────│                              │
```

- **Replay Protection:** Nonces are stored in the `verification` collection with a 15-minute TTL and atomically consumed upon verification (`consumeVerificationValue`). Replay attempts with the same signature or nonce fail immediately with `UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE`.
- **Domain & Expiry Validation:** SIWE messages are validated against the expected host domain, active chain ID (> 0), expiration time (`expirationTime`), and not-before timestamp (`notBefore`).
- **ENS Resolution:** New wallet sign-ins attempt reverse ENS lookup to automatically populate display names and avatars where available.

### 2. Wallet Linking & Unlinking

Signed-in users can link one or more Ethereum addresses to their existing account:

- **Link Wallet (`POST /api/auth/siwe/link`):**
  - Requires an active user session.
  - Verifies EIP-4361 message and cryptographic signature.
  - Consumes a fresh single-use nonce.
  - Rejects attempts if the address is already linked to another account (`409 Conflict`).
  - Idempotent if already linked to the current user.
- **Unlink Wallet (`POST /api/auth/siwe/unlink`):**
  - Requires an active user session.
  - Guarded against account lockouts: Users cannot unlink their only authentication method (if they have no email and only 1 linked wallet).
  - Promotes the oldest remaining wallet to `primary` if the primary wallet was unlinked.
- **List Wallets (`GET /api/auth/siwe/wallets`):**
  - Returns all linked addresses, chain IDs, primary status, creation timestamps, and reverse ENS names.

### 3. Session & Backend Assertion Compatibility

- Session cookie format remains standard Better Auth cookies (`better-auth.session_token`).
- The Next.js BFF proxy (`frontend/src/proxy.ts`) checks `getSessionCookie(request)` and is completely unchanged.
- Backend HMAC assertions (`backendAssertion` in `frontend/src/features/auth/server/backend-assertion.ts`) continue to supply valid signed assertions for agent and coordinator endpoints.

---

## Testing

Run the SIWE unit and integration test suite:

```bash
bun test tests/siwe-auth.test.mjs
```
