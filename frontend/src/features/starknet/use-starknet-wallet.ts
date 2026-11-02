import { connect, disconnect } from "starknetkit";
import { useState, useCallback, useEffect, useRef } from "react";
import type { StarknetWindowObject } from "@starknet-io/types-js";

type InvokeResult = { transaction_hash: string };

function firstAddress(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("0x")) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export function useStarknetWallet() {
  const walletRef = useRef<StarknetWindowObject | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const remember = useCallback((nextWallet: StarknetWindowObject | null, nextAddress: string | null) => {
    if (!nextWallet || !nextAddress) return null;
    walletRef.current = nextWallet;
    setAddress(nextAddress);
    return nextAddress;
  }, []);

  useEffect(() => {
    connect({ modalMode: "neverAsk", dappName: "Quantum Platform" })
      .then(({ wallet: existing, connectorData }) => {
        remember(existing ?? null, connectorData?.account ?? null);
      })
      .catch(() => {});
  }, [remember]);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const { wallet: connected, connectorData } = await connect({
        modalMode: "alwaysAsk",
        modalTheme: "dark",
        dappName: "Quantum Platform",
      });
      const fromData = connectorData?.account ?? null;
      if (fromData && connected) return remember(connected, fromData);
      if (!connected) return null;
      const requested = await connected.request({ type: "wallet_requestAccounts" });
      return remember(connected, firstAddress(requested));
    } finally {
      setIsConnecting(false);
    }
  }, [remember]);

  const disconnectWallet = useCallback(async () => {
    await disconnect();
    walletRef.current = null;
    setAddress(null);
  }, []);

  const signAndSend = useCallback(
    async (contractAddress: string, entrypoint: string, calldata: string[]) => {
      const signer = walletRef.current;
      if (!signer) throw new Error("Wallet not connected");
      const result = (await signer.request({
        type: "wallet_addInvokeTransaction",
        params: {
          calls: [
            {
              contract_address: contractAddress,
              entry_point: entrypoint,
              calldata,
            },
          ],
        },
      })) as InvokeResult;
      return result.transaction_hash;
    },
    [],
  );

  return {
    address,
    isConnecting,
    connectWallet,
    disconnectWallet,
    signAndSend,
  };
}
