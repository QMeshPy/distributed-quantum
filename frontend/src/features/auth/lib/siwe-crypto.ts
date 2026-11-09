import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import { toChecksumAddress } from "./siwe-parser";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recovers the Ethereum address from an EIP-191 personal_sign signature and message.
 * Server-only, keep out of client bundles (uses noble curves / Node-like APIs).
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

  const r = hexToBytes(cleanSig.slice(0, 64));
  const s = hexToBytes(cleanSig.slice(64, 128));
  const v = Number.parseInt(cleanSig.slice(128, 130), 16);
  const recid = v >= 27 ? v - 27 : v;
  if (recid !== 0 && recid !== 1) {
    throw new Error(`Invalid signature recovery byte (v): ${v}`);
  }

  const msgBytes = utf8Bytes(message);
  const prefix = utf8Bytes(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
  const digest = keccak_256(concatBytes(prefix, msgBytes));

  // CurveFn typings omit recoverPublicKey; Signature.recoverPublicKey is typed.
  const sig = new secp256k1.Signature(
    BigInt(`0x${bytesToHex(r)}`),
    BigInt(`0x${bytesToHex(s)}`),
    recid,
  );
  const point = sig.recoverPublicKey(digest);
  const uncompressed = point.toBytes(false).slice(1);
  const addrBytes = keccak_256(uncompressed).slice(-20);
  return toChecksumAddress(`0x${bytesToHex(addrBytes)}`);
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
