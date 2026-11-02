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
 * Generates an unguessable 16-byte (32-character) hex nonce.
 * Uses Web Crypto only so this module stays safe to import from client components.
 */
export function generateSiweNonce(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error("Secure random number generator unavailable");
  }
  webCrypto.getRandomValues(bytes);
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
