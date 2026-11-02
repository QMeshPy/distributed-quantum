"""Immutable chain metadata and capability requirements for wallet operations."""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# EVM ids stay canonical decimals. Starknet is Sepolia only; mainnet is out of scope.
ChainId = Annotated[
    str, Field(pattern=r"^(?:eip155:[1-9][0-9]{0,31}|starknet:SN_SEPOLIA)$")
]
NetworkAlias = Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]{0,63}$")]
EvmAddress = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{40}$")]
# EVM addresses are 20 bytes. Starknet felts are checked again per family.
TokenAddress = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{1,64}$")]
ChainFamily = Literal["evm", "starknet"]
# Keyless public endpoints only: HTTPS, no credentials, query string or fragment.
PublicRpcUrl = Annotated[
    str, Field(pattern=r"^https://[a-z0-9]+(?:[.-][a-z0-9]+)*(?:/[A-Za-z0-9._~-]+)*/?$")
]
Capability = Literal[
    "explorer_url",
    "create_wallet",
    "get_balance",
    "transfer_stablecoin",
    "verify_transaction",
    "get_price",
    "anchor_root",
    "aave_supply",
    "aave_withdraw",
    "faucet_instructions",
]


# Anchoring must never target these, whatever an entry's testnet flag says.
_KNOWN_MAINNETS = frozenset(
    {
        "eip155:1",
        "eip155:10",
        "eip155:56",
        "eip155:137",
        "eip155:4663",
        "eip155:8453",
        "eip155:42161",
    }
)

# CDP/AgentKit wallet networks we have validated end-to-end (testnet only).
# chain_id → (agentkit alias, cdp alias)
_WALLET_PROVIDER_NETWORKS: dict[str, tuple[str, str]] = {
    "eip155:84532": ("base-sepolia", "base-sepolia"),
    "eip155:421614": ("arbitrum-sepolia", "arbitrum-sepolia"),
}


class _RegistryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)


class NativeToken(_RegistryModel):
    symbol: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9]+$")
    decimals: int = Field(ge=0, le=255, strict=True)


class Stablecoin(NativeToken):
    address: TokenAddress


class ProviderAliases(_RegistryModel):
    """Provider names are mappings, not promises of operational support."""

    agentkit: NetworkAlias | None = None
    cdp: NetworkAlias | None = None


class ExplorerTemplates(_RegistryModel):
    """Public HTTPS links with one terminal placeholder and no credentials/query."""

    transaction: str
    address: str
    block: str

    @model_validator(mode="after")
    def validate_templates(self) -> ExplorerTemplates:
        for value, path, placeholder in (
            (self.transaction, "tx", "tx_hash"),
            # Voyager publishes contracts at /contract/{address}; EVM explorers use /address/.
            (self.address, "(?:address|contract)", "address"),
            (self.block, "block", "block_number"),
        ):
            pattern = rf"https://[a-z0-9]+(?:[.-][a-z0-9]+)*/{path}/\{{{placeholder}\}}"
            if re.fullmatch(pattern, value) is None:
                raise ValueError("invalid public explorer template")
        return self


class PriceFeedSpec(_RegistryModel):
    address: EvmAddress
    max_age_seconds: int = Field(gt=0, le=86400, strict=True)
    max_deviation_bps: int = Field(gt=0, le=10000, strict=True)


class ChainSpec(_RegistryModel):
    chain_id: ChainId
    family: ChainFamily
    display_name: str = Field(min_length=1, max_length=80, pattern=r"^\S(?:.*\S)?$")
    testnet: bool = Field(strict=True)
    enabled: bool = Field(strict=True)
    aliases: tuple[NetworkAlias, ...] = ()
    provider_aliases: ProviderAliases = Field(default_factory=ProviderAliases)
    # The environment variable may hold a credential-bearing URL; it is never
    # stored here, returned by the API or logged. public_rpc_url is the fallback.
    rpc_env_var: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    public_rpc_url: PublicRpcUrl | None = None
    explorers: ExplorerTemplates
    native_token: NativeToken
    stablecoin: Stablecoin | None = None
    aave_pool_address: EvmAddress | None = None
    capabilities: tuple[Capability, ...] = ()
    price_feeds: dict[NetworkAlias, PriceFeedSpec] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_network(self) -> ChainSpec:
        if self.enabled and not self.testnet:
            raise ValueError("mainnet networks must remain disabled")
        if len(set(self.aliases)) != len(self.aliases):
            raise ValueError("duplicate network alias")
        if len(set(self.capabilities)) != len(self.capabilities):
            raise ValueError("duplicate operation capability")
        if self.family == "starknet":
            self._validate_starknet()
            return self
        # Read-only RPC checks need no wallet provider, so any EVM chain may offer them.
        if "get_price" in self.capabilities and not self.price_feeds:
            raise ValueError("price reads require configured feeds")
        # Anchors are sent by a dedicated low-balance key, not the wallet provider.
        if "anchor_root" in self.capabilities:
            if not self.testnet or self.chain_id in _KNOWN_MAINNETS:
                raise ValueError("provenance anchoring is limited to testnets")
            if "verify_transaction" not in self.capabilities:
                raise ValueError("provenance anchoring requires transaction verification")
        wallet_operations = set(self.capabilities) - {
            "explorer_url",
            "verify_transaction",
            "get_price",
            "anchor_root",
        }
        if wallet_operations:
            expected = _WALLET_PROVIDER_NETWORKS.get(self.chain_id)
            if (
                expected is None
                or self.provider_aliases.agentkit != expected[0]
                or self.provider_aliases.cdp != expected[1]
            ):
                raise ValueError("wallet provider does not support this network")
            if self.stablecoin is None or self.stablecoin.symbol != "USDC":
                raise ValueError("wallet operations require USDC metadata")
            if self.native_token.symbol != "ETH":
                raise ValueError("wallet operations require ETH metadata")
        if {"transfer_stablecoin", "aave_supply", "aave_withdraw"} & wallet_operations:
            if "explorer_url" not in self.capabilities:
                raise ValueError("transaction operations require explorer links")
        if {"transfer_stablecoin", "aave_supply"} & wallet_operations:
            if "get_balance" not in self.capabilities:
                raise ValueError("transaction operations require balance queries")
        if {"aave_supply", "aave_withdraw"} & wallet_operations and not self.aave_pool_address:
            raise ValueError("Aave operations require a pool address")
        if self.stablecoin is not None and not re.fullmatch(
            r"0x[0-9a-fA-F]{40}", self.stablecoin.address
        ):
            raise ValueError("invalid token address")
        return self

    def _validate_starknet(self) -> None:
        if self.chain_id != "starknet:SN_SEPOLIA" or not self.testnet:
            raise ValueError("starknet support is sepolia testnet only")
        if set(self.capabilities) - {"explorer_url", "verify_transaction"}:
            raise ValueError("starknet adapter does not support this operation")
        if self.provider_aliases.agentkit is not None or self.provider_aliases.cdp is not None:
            raise ValueError("starknet has no EVM wallet provider")
        if self.aave_pool_address is not None:
            raise ValueError("starknet has no Aave pool in this adapter")
        if self.stablecoin is not None and not re.fullmatch(
            r"0x[0-9a-fA-F]{1,64}", self.stablecoin.address
        ):
            raise ValueError("invalid token address")

    @property
    def identifiers(self) -> frozenset[str]:
        """All explicitly configured names accepted at the registry boundary."""
        return frozenset(
            name
            for name in (
                self.chain_id,
                *self.aliases,
                self.provider_aliases.agentkit,
                self.provider_aliases.cdp,
            )
            if name is not None
        )


class UnknownNetworkError(ValueError):
    """A requested name has no registry entry."""


class DisabledNetworkError(ValueError):
    """A configured network is unavailable for use."""


class ChainRegistry(_RegistryModel):
    default_chain_id: ChainId
    chains: tuple[ChainSpec, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_registry(self) -> ChainRegistry:
        seen: set[str] = set()
        for chain in self.chains:
            if seen.intersection(chain.identifiers):
                raise ValueError("duplicate chain identifier or network alias")
            seen.update(chain.identifiers)
        default = next((c for c in self.chains if c.chain_id == self.default_chain_id), None)
        if default is None or not default.enabled:
            raise ValueError("default chain must identify an enabled registry entry")
        return self

    def resolve(self, network: str | None = None) -> ChainSpec:
        """Resolve a canonical ID or explicit alias, never silently fall back."""
        identifier = self.default_chain_id if network is None else network
        for chain in self.chains:
            if identifier in chain.identifiers:
                if not chain.enabled:
                    raise DisabledNetworkError("network is disabled")
                return chain
        # Do not echo caller input, which could accidentally contain credentials.
        raise UnknownNetworkError("unknown network")
