import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export interface ParsedSiweMessage {
  scheme?: string;
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: number;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface CreateSiweMessageParams {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version?: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
}

const HEADER_REGEX =
  /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?(\S+) wants you to sign in with your Ethereum account:$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const FIELD_REGEX = /^([A-Za-z ]+): (.*)$/;

/**
 * Normalizes a SIWE domain for comparison: strips protocol scheme and path, leaving host[:port].
 */
export function normalizeSiweDomain(domain: string): string {
  const withoutScheme = domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const pathStart = withoutScheme.indexOf("/");
  return pathStart === -1 ? withoutScheme : withoutScheme.slice(0, pathStart);
}

/**
 * Parse an EIP-4361 Sign-In with Ethereum message.
 */
export function parseSiweMessage(message: string): ParsedSiweMessage {
  const result: ParsedSiweMessage = {};
  const lines = message.split(/\r?\n/);
  const headerMatch = lines[0]?.match(HEADER_REGEX);
  if (headerMatch) {
    if (headerMatch[1]) result.scheme = headerMatch[1];
    result.domain = headerMatch[2];
  }
  const addressLine = lines[1]?.trim();
  if (addressLine && ADDRESS_REGEX.test(addressLine)) {
    result.address = addressLine;
  }

  for (const line of lines) {
    const match = line.match(FIELD_REGEX);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case "URI":
        result.uri = value;
        break;
      case "Version":
        result.version = value;
        break;
      case "Chain ID": {
        const parsed = Number(value);
        if (Number.isInteger(parsed)) result.chainId = parsed;
        break;
      }
      case "Nonce":
        result.nonce = value;
        break;
      case "Issued At":
        result.issuedAt = value;
        break;
      case "Expiration Time":
        result.expirationTime = value;
        break;
      case "Not Before":
        result.notBefore = value;
        break;
      case "Request ID":
        result.requestId = value;
        break;
    }
  }

  return result;
}

/**
 * Formats parameters into a standard EIP-4361 Sign-In with Ethereum message string.
 */
export function formatSiweMessage(params: CreateSiweMessageParams): string {
  const version = params.version || "1";
  const issuedAt = params.issuedAt || new Date().toISOString();
  const statement =
    params.statement || "Sign in to QuantumMesh Distributed Services.";

  const header = `${params.domain} wants you to sign in with your Ethereum account:\n${params.address}\n\n${statement}\n\n`;

  const fields = [
    `URI: ${params.uri}`,
    `Version: ${version}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ];

  if (params.expirationTime) {
    fields.push(`Expiration Time: ${params.expirationTime}`);
  }
  if (params.notBefore) {
    fields.push(`Not Before: ${params.notBefore}`);
  }
  if (params.requestId) {
    fields.push(`Request ID: ${params.requestId}`);
  }

  return header + fields.join("\n");
}

/**
 * Converts any hex Ethereum address into an EIP-55 checksummed address.
 */
export function toChecksumAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 40) return address;
  const hashBytes = keccak_256(new TextEncoder().encode(clean));
  const hashHex = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  let ret = "0x";
  for (let i = 0; i < clean.length; i++) {
    if (parseInt(hashHex[i], 16) >= 8) {
      ret += clean[i].toUpperCase();
    } else {
      ret += clean[i];
    }
  }
  return ret;
}

/**
 * Recovers the Ethereum address from an EIP-191 personal_sign signature and message.
 */
export function recoverAddressFromEthSig(
  message: string,
  signatureHex: string,
): string {
  const cleanSig = signatureHex.startsWith("0x")
    ? signatureHex.slice(2)
    : signatureHex;
  if (cleanSig.length !== 130) {
    throw new Error(
      `Invalid signature length: expected 130 hex characters, got ${cleanSig.length}`,
    );
  }

  const r = Buffer.from(cleanSig.slice(0, 64), "hex");
  const s = Buffer.from(cleanSig.slice(64, 128), "hex");
  const v = parseInt(cleanSig.slice(128, 130), 16);
  const recid = v >= 27 ? v - 27 : v;
  if (recid !== 0 && recid !== 1) {
    throw new Error(`Invalid signature recovery byte (v): ${v}`);
  }

  const prefix = Buffer.from(
    "\x19Ethereum Signed Message:\n" + Buffer.byteLength(message, "utf8"),
    "utf8",
  );
  const digest = keccak_256(
    Buffer.concat([prefix, Buffer.from(message, "utf8")]),
  );

  // CurveFn typings omit recoverPublicKey; Signature.recoverPublicKey is typed.
  const sig = new secp256k1.Signature(
    BigInt("0x" + Buffer.from(r).toString("hex")),
    BigInt("0x" + Buffer.from(s).toString("hex")),
    recid,
  );
  const point = sig.recoverPublicKey(digest);
  const uncompressed = point.toBytes(false).slice(1);
  const addrBytes = keccak_256(uncompressed).slice(-20);
  return toChecksumAddress("0x" + Buffer.from(addrBytes).toString("hex"));
}

/**
 * Verifies that a SIWE message was signed by the expected address.
 */
export function verifySiweSignature(
  message: string,
  signature: string,
  expectedAddress: string,
): boolean {
  try {
    const recovered = recoverAddressFromEthSig(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Generates an unguessable 16-byte (32-character) alphanumeric nonce.
 */
export function generateSiweNonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node environment fallback
    const { randomBytes } = require("node:crypto");
    return randomBytes(16).toString("hex");
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives the expected application domain for SIWE verification.
 */
export function getExpectedSiweDomain(hostHeader?: string | null): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_DOMAIN) {
    return normalizeSiweDomain(process.env.NEXT_PUBLIC_APP_DOMAIN);
  }
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_APP_URL);
      return normalizeSiweDomain(url.host);
    } catch {
      // fallback
    }
  }
  if (hostHeader) {
    return normalizeSiweDomain(hostHeader);
  }
  return "localhost:3000";
}
