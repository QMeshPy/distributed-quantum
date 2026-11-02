export type ChainCapability =
  | "explorer_url"
  | "create_wallet"
  | "get_balance"
  | "transfer_stablecoin"
  | "verify_transaction"
  | "aave_supply"
  | "aave_withdraw"
  | "faucet_instructions"
  | "get_price"
  | "anchor_root";

export type ExplorerKind = "transaction" | "address" | "block";

/** One enabled network from `GET /api/v1/chains` (public fields only). */
export type Chain = {
  chain_id: string;
  family: string;
  display_name: string;
  /** Legacy names such as the `network` stored on wallets ("base-sepolia"). */
  aliases: string[];
  testnet: boolean;
  native_token: { symbol: string; decimals: number };
  stablecoin: { symbol: string; decimals: number; address: string } | null;
  explorers: Record<ExplorerKind, string>;
  capabilities: ChainCapability[];
};

export type ChainsResponse = {
  default_chain_id: string;
  chains: Chain[];
};
