import "server-only";

import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { siwe } from "better-auth/plugins";
import { getDatabase } from "@/shared/lib/mongodb";
import { BACKEND_AGENTKIT } from "@/constants/backend";

import {
  normalizeSiweDomain,
  parseSiweMessage,
  toChecksumAddress,
  recoverAddressFromEthSig,
  verifySiweSignature,
  generateSiweNonce,
  getExpectedSiweDomain,
  type ParsedSiweMessage,
} from "../lib/siwe-parser";

export type { ParsedSiweMessage };
export {
  normalizeSiweDomain,
  parseSiweMessage,
  toChecksumAddress,
  recoverAddressFromEthSig,
  verifySiweSignature,
  generateSiweNonce,
  getExpectedSiweDomain,
};

/**
 * Look up reverse ENS name and avatar if available.
 */
export async function lookupEnsProfile(
  walletAddress: string,
): Promise<{ name?: string; avatar?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const url = `${BACKEND_AGENTKIT.ENS_REVERSE}?address=${encodeURIComponent(walletAddress)}`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) return {};
    const data = (await res.json()) as { name?: string | null };
    return {
      name: data.name || undefined,
      avatar: undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Creates the Better Auth SIWE plugin with cryptographic verification and ENS lookup.
 */
export function createSiwePlugin(domainOverride?: string) {
  return siwe({
    get domain() {
      return domainOverride || getExpectedSiweDomain();
    },
    getNonce: async () => generateSiweNonce(),
    verifyMessage: async ({ message, signature, address }) => {
      return verifySiweSignature(message, signature, address);
    },
    anonymous: true,
    ensLookup: async ({ walletAddress }) => {
      const profile = await lookupEnsProfile(walletAddress);
      return {
        name: profile.name || walletAddress,
        avatar: profile.avatar || "",
      };
    },
  });
}

export interface LinkWalletParams {
  userId: string;
  message: string;
  signature: string;
  hostHeader?: string | null;
}

/**
 * Links a verified Ethereum wallet to an existing user account.
 */
export async function linkWalletToUser(params: LinkWalletParams): Promise<{
  status: number;
  success?: boolean;
  alreadyLinked?: boolean;
  address?: string;
  chainId?: number;
  isPrimary?: boolean;
  ensName?: string | null;
  error?: string;
  code?: string;
}> {
  const { userId, message, signature, hostHeader } = params;
  const parsed = parseSiweMessage(message);

  if (
    !parsed.address ||
    !parsed.nonce ||
    !parsed.domain ||
    typeof parsed.chainId !== "number" ||
    parsed.chainId <= 0
  ) {
    return { status: 400, error: "Invalid SIWE message fields." };
  }

  const expectedDomain = getExpectedSiweDomain(hostHeader);
  if (normalizeSiweDomain(parsed.domain) !== normalizeSiweDomain(expectedDomain)) {
    return {
      status: 401,
      code: "UNAUTHORIZED_SIWE_MESSAGE_MISMATCH",
      error: `Domain mismatch: message specifies '${parsed.domain}', expected '${expectedDomain}'.`,
    };
  }

  const now = Date.now();
  if (parsed.expirationTime) {
    const expiresAt = Date.parse(parsed.expirationTime);
    if (!Number.isNaN(expiresAt) && now >= expiresAt) {
      return {
        status: 401,
        code: "UNAUTHORIZED_SIWE_MESSAGE_EXPIRED",
        error: "Unauthorized: SIWE message has expired.",
      };
    }
  }

  if (parsed.notBefore) {
    const notBefore = Date.parse(parsed.notBefore);
    if (!Number.isNaN(notBefore) && now < notBefore) {
      return {
        status: 401,
        code: "UNAUTHORIZED_SIWE_MESSAGE_NOT_YET_VALID",
        error: "Unauthorized: SIWE message is not yet valid.",
      };
    }
  }

  // Atomically consume single-use nonce from the verification collection
  const db = await getDatabase();
  const identifier = `siwe:${parsed.nonce}`;
  const nonceDoc = await db.collection("verification").findOneAndDelete({ identifier });
  if (!nonceDoc || (nonceDoc.expiresAt && new Date(nonceDoc.expiresAt).getTime() < now)) {
    return {
      status: 401,
      code: "UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE",
      error: "Unauthorized: Invalid or expired nonce.",
    };
  }

  // Cryptographically verify signature
  const checksumAddress = toChecksumAddress(parsed.address);
  const isValidSig = verifySiweSignature(message, signature, checksumAddress);
  if (!isValidSig) {
    return { status: 401, error: "Unauthorized: Invalid SIWE signature." };
  }

  // Check if this wallet is already linked to anyone
  const existingWallet = await db.collection("walletAddress").findOne({
    address: checksumAddress,
  });

  if (existingWallet) {
    if (existingWallet.userId !== userId) {
      return {
        status: 409,
        error: "This wallet address is already linked to another account.",
      };
    }
    return {
      status: 200,
      success: true,
      alreadyLinked: true,
      address: checksumAddress,
      chainId: parsed.chainId,
    };
  }

  // Determine if this should be the primary wallet
  const userWalletCount = await db.collection("walletAddress").countDocuments({ userId });
  const isPrimary = userWalletCount === 0;

  await db.collection("walletAddress").insertOne({
    userId,
    address: checksumAddress,
    chainId: parsed.chainId,
    isPrimary,
    createdAt: new Date(),
  });

  await db.collection("account").updateOne(
    {
      userId,
      providerId: "siwe",
      accountId: `${checksumAddress}:${parsed.chainId}`,
    },
    {
      $setOnInsert: {
        userId,
        providerId: "siwe",
        accountId: `${checksumAddress}:${parsed.chainId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  // Optional ENS lookup to enrich profile name / avatar if not present
  const ens = await lookupEnsProfile(checksumAddress);
  if (ens.name || ens.avatar) {
    const userUpdate: Record<string, string> = {};
    if (ens.name) userUpdate.name = ens.name;
    if (ens.avatar) userUpdate.image = ens.avatar;

    const userFilter = ObjectId.isValid(userId)
      ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
      : { id: userId };
    await db.collection("user").updateOne(userFilter, { $set: userUpdate });
  }

  return {
    status: 200,
    success: true,
    address: checksumAddress,
    chainId: parsed.chainId,
    isPrimary,
    ensName: ens.name ?? null,
  };
}

/**
 * Unlinks a wallet from an existing user account.
 */
export async function unlinkWalletFromUser(
  userId: string,
  address: string,
): Promise<{
  status: number;
  success?: boolean;
  message?: string;
  error?: string;
}> {
  const checksumAddress = toChecksumAddress(address);
  const db = await getDatabase();

  const wallet = await db.collection("walletAddress").findOne({
    userId,
    address: checksumAddress,
  });

  if (!wallet) {
    return { status: 404, error: "Wallet not linked to this account." };
  }

  // Guard: Ensure user has at least one other auth method
  const userFilter = ObjectId.isValid(userId)
    ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
    : { id: userId };
  const userDoc = await db.collection("user").findOne(userFilter);
  const hasRealEmail = !!(
    userDoc?.email &&
    !userDoc.email.endsWith("@siwe") &&
    !userDoc.email.endsWith(".internal")
  );

  const walletCount = await db.collection("walletAddress").countDocuments({ userId });
  if (!hasRealEmail && walletCount <= 1) {
    return {
      status: 400,
      error:
        "Cannot unlink your only sign-in method. Please connect another wallet or set an email first.",
    };
  }

  // Remove walletAddress
  await db.collection("walletAddress").deleteOne({ _id: wallet._id });

  // Remove account record for this wallet
  await db.collection("account").deleteMany({
    userId,
    providerId: "siwe",
    accountId: { $regex: `^${checksumAddress}:`, $options: "i" },
  });

  // If the unlinked wallet was primary, promote the oldest remaining wallet to primary
  if (wallet.isPrimary) {
    await db
      .collection("walletAddress")
      .updateOne({ userId }, { $set: { isPrimary: true } }, { sort: { createdAt: 1 } });
  }

  return {
    status: 200,
    success: true,
    message: "Wallet unlinked successfully.",
  };
}

export interface LinkedWalletInfo {
  address: string;
  chainId: number;
  isPrimary: boolean;
  createdAt: Date;
  ensName?: string | null;
}

/**
 * Lists all linked wallets for the given user.
 */
export async function getLinkedWalletsForUser(userId: string): Promise<LinkedWalletInfo[]> {
  const db = await getDatabase();
  const wallets = await db
    .collection("walletAddress")
    .find({ userId })
    .sort({ createdAt: 1 })
    .toArray();

  return Promise.all(
    wallets.map(async (w) => {
      const ens = await lookupEnsProfile(w.address);
      return {
        address: w.address,
        chainId: w.chainId,
        isPrimary: !!w.isPrimary,
        createdAt: w.createdAt,
        ensName: ens.name ?? null,
      };
    }),
  );
}
