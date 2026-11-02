import {
  formatSiweMessage,
  toChecksumAddress,
  type CreateSiweMessageParams,
} from "./siwe-parser";

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<any>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getEthereumProvider(): EthereumProvider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No Ethereum wallet detected. Please install MetaMask, Coinbase Wallet, or a compatible Web3 wallet.",
    );
  }
  return window.ethereum;
}

export async function fetchSiweNonce(): Promise<string> {
  const res = await fetch("/api/auth/siwe/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      (errorBody as { message?: string }).message ||
        "Failed to request single-use sign-in nonce.",
    );
  }

  const data = (await res.json()) as { nonce: string };
  if (!data.nonce) {
    throw new Error("Invalid nonce response from server.");
  }
  return data.nonce;
}

export interface SiweAuthResult {
  success: boolean;
  user?: {
    id: string;
    walletAddress?: string;
    chainId?: number;
  };
  error?: string;
}

/**
 * Initiates the complete Sign-in with Ethereum (EIP-4361) flow in the browser.
 */
export async function signInWithEthereum(): Promise<SiweAuthResult> {
  const provider = getEthereumProvider();

  // Request user account
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No Ethereum account selected.");
  }

  const rawAddress = accounts[0];
  const address = toChecksumAddress(rawAddress);

  // Request chain ID
  const chainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as string;
  const chainId = parseInt(chainIdHex, 16) || 1;

  // Obtain single-use nonce
  const nonce = await fetchSiweNonce();

  // Construct standard EIP-4361 SIWE message
  const domain = window.location.host;
  const uri = window.location.origin;
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const messageParams: CreateSiweMessageParams = {
    domain,
    address,
    statement: "Sign in to QuantumMesh Distributed Services.",
    uri,
    version: "1",
    chainId,
    nonce,
    issuedAt,
    expirationTime,
  };

  const message = formatSiweMessage(messageParams);

  // Request cryptographic personal_sign signature
  let signature: string;
  try {
    signature = (await provider.request({
      method: "personal_sign",
      params: [message, rawAddress],
    })) as string;
  } catch (err: any) {
    if (err?.code === 4001 || err?.message?.includes("rejected")) {
      throw new Error("Signature request was rejected by user.");
    }
    // Fallback for providers expecting [address, message]
    signature = (await provider.request({
      method: "personal_sign",
      params: [rawAddress, message],
    })) as string;
  }

  // Send to Better Auth SIWE verification endpoint
  const verifyRes = await fetch("/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok) {
    const errorMsg =
      (verifyData as { message?: string }).message ||
      (verifyData as { error?: string }).error ||
      "Failed to verify Ethereum signature.";
    return { success: false, error: errorMsg };
  }

  return {
    success: true,
    user: (verifyData as { user?: any }).user,
  };
}

export interface LinkWalletResult {
  success: boolean;
  address?: string;
  chainId?: number;
  isPrimary?: boolean;
  ensName?: string | null;
  alreadyLinked?: boolean;
  error?: string;
}

/**
 * Links an Ethereum wallet to the current signed-in user account.
 */
export async function linkEthereumWallet(): Promise<LinkWalletResult> {
  const provider = getEthereumProvider();

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No Ethereum account selected.");
  }

  const rawAddress = accounts[0];
  const address = toChecksumAddress(rawAddress);

  const chainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as string;
  const chainId = parseInt(chainIdHex, 16) || 1;

  const nonce = await fetchSiweNonce();

  const domain = window.location.host;
  const uri = window.location.origin;
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const messageParams: CreateSiweMessageParams = {
    domain,
    address,
    statement: "Link this Ethereum account to your QuantumMesh profile.",
    uri,
    version: "1",
    chainId,
    nonce,
    issuedAt,
    expirationTime,
  };

  const message = formatSiweMessage(messageParams);

  let signature: string;
  try {
    signature = (await provider.request({
      method: "personal_sign",
      params: [message, rawAddress],
    })) as string;
  } catch (err: any) {
    if (err?.code === 4001 || err?.message?.includes("rejected")) {
      throw new Error("Signature request was rejected by user.");
    }
    signature = (await provider.request({
      method: "personal_sign",
      params: [rawAddress, message],
    })) as string;
  }

  const res = await fetch("/api/auth/siwe/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      "Failed to link wallet.";
    return { success: false, error: errorMsg };
  }

  return {
    success: true,
    address: (data as { address?: string }).address,
    chainId: (data as { chainId?: number }).chainId,
    isPrimary: (data as { isPrimary?: boolean }).isPrimary,
    ensName: (data as { ensName?: string | null }).ensName,
    alreadyLinked: (data as { alreadyLinked?: boolean }).alreadyLinked,
  };
}

export interface UnlinkWalletResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Unlinks an Ethereum wallet from the user's account.
 */
export async function unlinkEthereumWallet(address: string): Promise<UnlinkWalletResult> {
  const res = await fetch("/api/auth/siwe/unlink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      "Failed to unlink wallet.";
    return { success: false, error: errorMsg };
  }

  return {
    success: true,
    message: (data as { message?: string }).message,
  };
}

export interface LinkedWalletItem {
  address: string;
  chainId: number;
  isPrimary: boolean;
  createdAt: string;
  ensName?: string | null;
}

/**
 * Fetches the user's currently linked wallets.
 */
export async function fetchLinkedWallets(): Promise<LinkedWalletItem[]> {
  const res = await fetch("/api/auth/siwe/wallets", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as { wallets?: LinkedWalletItem[] };
  return data.wallets || [];
}
