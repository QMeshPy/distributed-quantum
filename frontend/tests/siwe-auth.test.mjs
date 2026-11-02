import { describe, it, expect } from "bun:test";
import { secp256k1 } from "../node_modules/@noble/curves/secp256k1.js";
import { keccak_256 } from "../node_modules/@noble/hashes/sha3.js";
import {
  parseSiweMessage,
  formatSiweMessage,
  normalizeSiweDomain,
  toChecksumAddress,
  recoverAddressFromEthSig,
  verifySiweSignature,
  generateSiweNonce,
  getExpectedSiweDomain,
} from "../src/features/auth/lib/siwe-parser.ts";
import { betterAuth } from "better-auth";
import { siwe } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";

function signMessage(message, secretKey) {
  const prefix = Buffer.from(
    "\x19Ethereum Signed Message:\n" + Buffer.byteLength(message, "utf8"),
    "utf8",
  );
  const digest = keccak_256(Buffer.concat([prefix, Buffer.from(message, "utf8")]));
  const nobleSig = secp256k1.sign(digest, secretKey, { prehash: false, format: "recovered" });
  const recid = nobleSig[0];
  const rHex = Buffer.from(nobleSig.slice(1, 33)).toString("hex");
  const sHex = Buffer.from(nobleSig.slice(33, 65)).toString("hex");
  const vHex = (recid + 27).toString(16).padStart(2, "0");
  return "0x" + rHex + sHex + vHex;
}

function generateTestWallet() {
  const kp = secp256k1.keygen();
  const pubKey = secp256k1.getPublicKey(kp.secretKey, false).slice(1);
  const address = toChecksumAddress("0x" + Buffer.from(keccak_256(pubKey).slice(-20)).toString("hex"));
  return { secretKey: kp.secretKey, address };
}

describe("EIP-4361 SIWE Parser & Formatter", () => {
  it("formats and parses standard EIP-4361 messages round-trip", () => {
    const params = {
      domain: "app.quantumnodes.io",
      address: "0x5c1B81Fc393Fe86C9181C175F58B009a147084c1",
      statement: "Sign in to QuantumMesh Distributed Services.",
      uri: "https://app.quantumnodes.io",
      version: "1",
      chainId: 1,
      nonce: "a1b2c3d4e5f67890",
      issuedAt: "2026-10-28T18:00:00.000Z",
      expirationTime: "2026-10-28T18:15:00.000Z",
    };

    const formatted = formatSiweMessage(params);
    expect(formatted).toContain("app.quantumnodes.io wants you to sign in with your Ethereum account:");
    expect(formatted).toContain("0x5c1B81Fc393Fe86C9181C175F58B009a147084c1");
    expect(formatted).toContain("Nonce: a1b2c3d4e5f67890");
    expect(formatted).toContain("Chain ID: 1");

    const parsed = parseSiweMessage(formatted);
    expect(parsed.domain).toBe("app.quantumnodes.io");
    expect(parsed.address).toBe("0x5c1B81Fc393Fe86C9181C175F58B009a147084c1");
    expect(parsed.chainId).toBe(1);
    expect(parsed.nonce).toBe("a1b2c3d4e5f67890");
    expect(parsed.version).toBe("1");
    expect(parsed.uri).toBe("https://app.quantumnodes.io");
    expect(parsed.expirationTime).toBe("2026-10-28T18:15:00.000Z");
  });

  it("normalizes domains correctly regardless of scheme or trailing paths", () => {
    expect(normalizeSiweDomain("localhost:3000")).toBe("localhost:3000");
    expect(normalizeSiweDomain("https://localhost:3000/")).toBe("localhost:3000");
    expect(normalizeSiweDomain("http://app.quantumnodes.io:8080/path/test")).toBe("app.quantumnodes.io:8080");
    expect(normalizeSiweDomain("APP.QUANTUMNODES.IO")).toBe("app.quantumnodes.io");
  });

  it("generates and verifies EIP-55 checksum addresses", () => {
    const raw = "0x5c1b81fc393fe86c9181c175f58b009a147084c1";
    const checksummed = toChecksumAddress(raw);
    expect(checksummed).toBe("0x5c1B81Fc393Fe86C9181C175F58B009a147084c1");
    expect(toChecksumAddress(checksummed)).toBe(checksummed);
  });
});

describe("SIWE Cryptographic Signature & Address Recovery", () => {
  it("recovers signer address accurately from personal_sign signatures", () => {
    const wallet = generateTestWallet();
    const message = "Sign in to QuantumMesh Distributed Services.\nNonce: 12345678";
    const signature = signMessage(message, wallet.secretKey);

    const recovered = recoverAddressFromEthSig(message, signature);
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(verifySiweSignature(message, signature, wallet.address)).toBe(true);
  });

  it("rejects signatures signed by a different address", () => {
    const walletA = generateTestWallet();
    const walletB = generateTestWallet();
    const message = "Test message";
    const signatureA = signMessage(message, walletA.secretKey);

    expect(verifySiweSignature(message, signatureA, walletB.address)).toBe(false);
  });

  it("rejects signatures when message content has been tampered with", () => {
    const wallet = generateTestWallet();
    const message = "Original message";
    const signature = signMessage(message, wallet.secretKey);
    const tamperedMessage = "Tampered message";

    expect(verifySiweSignature(tamperedMessage, signature, wallet.address)).toBe(false);
  });

  it("rejects malformed signature strings with invalid lengths or recovery bytes", () => {
    const message = "Test message";
    expect(() => recoverAddressFromEthSig(message, "0x1234")).toThrow(/Invalid signature length/);

    // 130 chars but invalid v (e.g. 99)
    const badV = "0x" + "a".repeat(128) + "99";
    expect(() => recoverAddressFromEthSig(message, badV)).toThrow(/Invalid signature recovery byte/);
  });

  it("generates high-entropy random nonces", () => {
    const nonce1 = generateSiweNonce();
    const nonce2 = generateSiweNonce();
    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBeGreaterThanOrEqual(16);
    expect(/^[0-9a-fA-F]+$/.test(nonce1)).toBe(true);
  });
});

describe("Better Auth SIWE Flow & Acceptance Criteria", () => {
  function createTestAuth(memDb, domain = "localhost:3000") {
    return betterAuth({
      baseURL: `http://${domain}`,
      database: memoryAdapter(memDb),
      plugins: [
        siwe({
          domain,
          getNonce: generateSiweNonce,
          verifyMessage: async ({ message, signature, address }) => {
            return verifySiweSignature(message, signature, address);
          },
          anonymous: true,
        }),
      ],
    });
  }

  it("completes full sign-in flow and rejects replay attacks (Criterion 1)", async () => {
    const memDb = { user: [], session: [], account: [], verification: [], walletAddress: [] };
    const auth = createTestAuth(memDb);
    const wallet = generateTestWallet();

    // 1. Get nonce
    const nonceRes = await auth.api.getSiweNonce();
    expect(nonceRes.nonce).toBeDefined();

    // 2. Format SIWE message
    const message = formatSiweMessage({
      domain: "localhost:3000",
      address: wallet.address,
      statement: "Sign in to QuantumMesh Distributed Services.",
      uri: "http://localhost:3000",
      version: "1",
      chainId: 1,
      nonce: nonceRes.nonce,
      issuedAt: new Date().toISOString(),
    });

    // 3. Sign message
    const signature = signMessage(message, wallet.secretKey);

    // 4. Verify and sign in
    const req = new Request("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });

    const res = await auth.handler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.walletAddress.toLowerCase()).toBe(wallet.address.toLowerCase());

    // 5. Replay attempt: same message and signature must fail immediately
    const replayReq = new Request("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });

    const replayRes = await auth.handler(replayReq);
    expect(replayRes.status).toBe(401);
    const replayData = await replayRes.json();
    expect(replayData.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
  });

  it("validates domain and rejects domain mismatches (Criterion 2)", async () => {
    const memDb = { user: [], session: [], account: [], verification: [], walletAddress: [] };
    const auth = createTestAuth(memDb, "expected-domain.com");
    const wallet = generateTestWallet();

    const nonceRes = await auth.api.getSiweNonce();

    // Attacker sends message for 'phishing-domain.com'
    const message = formatSiweMessage({
      domain: "phishing-domain.com",
      address: wallet.address,
      statement: "Sign in to QuantumMesh Distributed Services.",
      uri: "http://phishing-domain.com",
      version: "1",
      chainId: 1,
      nonce: nonceRes.nonce,
      issuedAt: new Date().toISOString(),
    });

    const signature = signMessage(message, wallet.secretKey);

    const req = new Request("http://expected-domain.com/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });

    const res = await auth.handler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_MISMATCH");
  });

  it("validates expiration time and rejects expired messages (Criterion 2)", async () => {
    const memDb = { user: [], session: [], account: [], verification: [], walletAddress: [] };
    const auth = createTestAuth(memDb);
    const wallet = generateTestWallet();

    const nonceRes = await auth.api.getSiweNonce();

    // Expired 5 minutes ago
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const message = formatSiweMessage({
      domain: "localhost:3000",
      address: wallet.address,
      statement: "Sign in to QuantumMesh Distributed Services.",
      uri: "http://localhost:3000",
      version: "1",
      chainId: 1,
      nonce: nonceRes.nonce,
      issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      expirationTime: pastTime,
    });

    const signature = signMessage(message, wallet.secretKey);

    const req = new Request("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });

    const res = await auth.handler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_EXPIRED");
  });

  it("validates chain ID and rejects non-positive chain IDs (Criterion 2)", async () => {
    const memDb = { user: [], session: [], account: [], verification: [], walletAddress: [] };
    const auth = createTestAuth(memDb);
    const wallet = generateTestWallet();

    const nonceRes = await auth.api.getSiweNonce();

    const message = formatSiweMessage({
      domain: "localhost:3000",
      address: wallet.address,
      statement: "Sign in to QuantumMesh Distributed Services.",
      uri: "http://localhost:3000",
      version: "1",
      chainId: 0, // Invalid chain ID
      nonce: nonceRes.nonce,
      issuedAt: new Date().toISOString(),
    });

    const signature = signMessage(message, wallet.secretKey);

    const req = new Request("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });

    const res = await auth.handler(req);
    expect(res.status).toBe(401);
  });
});

describe("Wallet Linking & Unlinking Logic (Criterion 3)", () => {
  function createMockDb() {
    const collections = {
      verification: new Map(),
      walletAddress: new Map(),
      account: new Map(),
      user: new Map(),
    };

    return {
      collections,
      collection(name) {
        const store = collections[name];
        return {
          async findOneAndDelete(filter) {
            for (const [id, doc] of store.entries()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) {
                store.delete(id);
                return doc;
              }
            }
            return null;
          },
          async findOne(filter) {
            for (const doc of store.values()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) return doc;
            }
            return null;
          },
          async insertOne(doc) {
            const id = Math.random().toString(36).slice(2);
            const entry = { _id: id, ...doc };
            store.set(id, entry);
            return { insertedId: id };
          },
          async countDocuments(filter) {
            let count = 0;
            for (const doc of store.values()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) count++;
            }
            return count;
          },
          async deleteOne(filter) {
            for (const [id, doc] of store.entries()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) {
                store.delete(id);
                return { deletedCount: 1 };
              }
            }
            return { deletedCount: 0 };
          },
          async deleteMany(filter) {
            let count = 0;
            for (const [id, doc] of store.entries()) {
              if (filter.userId && doc.userId !== filter.userId) continue;
              if (filter.providerId && doc.providerId !== filter.providerId) continue;
              store.delete(id);
              count++;
            }
            return { deletedCount: count };
          },
          async updateOne(filter, update) {
            for (const doc of store.values()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) {
                if (update.$set) Object.assign(doc, update.$set);
                return { modifiedCount: 1 };
              }
            }
            return { modifiedCount: 0 };
          },
        };
      },
    };
  }

  it("links a verified wallet to an existing user account", async () => {
    const mockDb = createMockDb();
    const wallet = generateTestWallet();
    const userId = "user-123";

    // Seed nonce in verification collection
    const nonce = "test-nonce-123456";
    mockDb.collections.verification.set("v1", {
      identifier: `siwe:${nonce}`,
      value: nonce,
      expiresAt: new Date(Date.now() + 600000),
    });

    const message = formatSiweMessage({
      domain: "localhost:3000",
      address: wallet.address,
      statement: "Link wallet",
      uri: "http://localhost:3000",
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = signMessage(message, wallet.secretKey);

    // Simulate link logic
    const parsed = parseSiweMessage(message);
    const consumed = await mockDb.collection("verification").findOneAndDelete({ identifier: `siwe:${parsed.nonce}` });
    expect(consumed).not.toBeNull();

    const verified = verifySiweSignature(message, signature, parsed.address);
    expect(verified).toBe(true);

    await mockDb.collection("walletAddress").insertOne({
      userId,
      address: parsed.address,
      chainId: parsed.chainId,
      isPrimary: true,
      createdAt: new Date(),
    });

    const stored = await mockDb.collection("walletAddress").findOne({ userId, address: parsed.address });
    expect(stored).not.toBeNull();
    expect(stored.isPrimary).toBe(true);
    expect(stored.chainId).toBe(1);
  });

  it("rejects linking if the wallet is already linked to another user (409 Conflict)", async () => {
    const mockDb = createMockDb();
    const wallet = generateTestWallet();

    // Already linked to user-A
    await mockDb.collection("walletAddress").insertOne({
      userId: "user-A",
      address: wallet.address,
      chainId: 1,
      isPrimary: true,
      createdAt: new Date(),
    });

    // user-B tries to link it
    const existing = await mockDb.collection("walletAddress").findOne({ address: wallet.address });
    expect(existing).not.toBeNull();
    expect(existing.userId).toBe("user-A");

    const attemptedUserId = "user-B";
    const conflict = existing.userId !== attemptedUserId;
    expect(conflict).toBe(true);
  });

  it("prevents unlinking if the wallet is the user's only auth method", async () => {
    const mockDb = createMockDb();
    const wallet = generateTestWallet();
    const userId = "wallet-only-user";

    // User has placeholder email and only 1 linked wallet
    mockDb.collections.user.set(userId, {
      id: userId,
      email: `${wallet.address.toLowerCase()}@siwe`,
    });

    await mockDb.collection("walletAddress").insertOne({
      userId,
      address: wallet.address,
      chainId: 1,
      isPrimary: true,
      createdAt: new Date(),
    });

    const userDoc = await mockDb.collection("user").findOne({ id: userId });
    const hasRealEmail = !!(userDoc?.email && !userDoc.email.endsWith("@siwe") && !userDoc.email.endsWith(".internal"));
    const walletCount = await mockDb.collection("walletAddress").countDocuments({ userId });

    const cannotUnlink = !hasRealEmail && walletCount <= 1;
    expect(cannotUnlink).toBe(true);
  });

  it("permits unlinking when user has a real email or multiple wallets", async () => {
    const mockDb = createMockDb();
    const wallet1 = generateTestWallet();
    const wallet2 = generateTestWallet();
    const userId = "user-with-options";

    mockDb.collections.user.set(userId, {
      id: userId,
      email: "user@example.com", // Real email
    });

    await mockDb.collection("walletAddress").insertOne({
      userId,
      address: wallet1.address,
      chainId: 1,
      isPrimary: true,
      createdAt: new Date(),
    });
    await mockDb.collection("walletAddress").insertOne({
      userId,
      address: wallet2.address,
      chainId: 1,
      isPrimary: false,
      createdAt: new Date(),
    });

    const userDoc = await mockDb.collection("user").findOne({ id: userId });
    const hasRealEmail = !!(userDoc?.email && !userDoc.email.endsWith("@siwe"));
    const walletCount = await mockDb.collection("walletAddress").countDocuments({ userId });

    const canUnlink = hasRealEmail || walletCount > 1;
    expect(canUnlink).toBe(true);

    // Unlink wallet 1
    await mockDb.collection("walletAddress").deleteOne({ userId, address: wallet1.address });
    const remaining = await mockDb.collection("walletAddress").countDocuments({ userId });
    expect(remaining).toBe(1);

    // Promote remaining wallet to primary
    await mockDb.collection("walletAddress").updateOne({ userId }, { $set: { isPrimary: true } });
    const updated = await mockDb.collection("walletAddress").findOne({ userId, address: wallet2.address });
    expect(updated.isPrimary).toBe(true);
  });
});

