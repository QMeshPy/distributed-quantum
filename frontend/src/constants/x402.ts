export const X402 = {
  gatewayHeader: "X-X402-Gateway-Secret",
  estimatePath: "/api/v1/internal/x402/circuits/estimate",
  paymentPath: "/api/v1/internal/x402/payments",
  submitPath: "/api/v1/internal/x402/circuits/submit",
  quoteLifetimeSeconds: 300,
  timeoutMs: 15_000,
  maxBodyBytes: 100_000,
  maxPaymentHeaderBytes: 64_000,
  networks: {
    "eip155:84532": {
      family: "evm",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": {
      family: "svm",
      asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
    "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe": {
      family: "avm",
      asset: "10458941",
    },
    "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=": {
      family: "avm",
      asset: "10458941",
    },
  },
} as const;
