"""Public, read-only network discovery with an explicit response allowlist."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from quantum_backend_v2.chains.models import (
    Capability,
    ChainFamily,
    ChainId,
    ChainRegistry,
    ExplorerTemplates,
    NativeToken,
    NetworkAlias,
    Stablecoin,
)


class PublicChain(BaseModel):
    chain_id: ChainId
    family: ChainFamily
    display_name: str
    # Legacy network names, such as the ``network`` stored on wallets.
    aliases: tuple[NetworkAlias, ...]
    testnet: bool
    native_token: NativeToken
    stablecoin: Stablecoin | None
    explorers: ExplorerTemplates
    capabilities: tuple[Capability, ...]


class ChainsResponse(BaseModel):
    default_chain_id: ChainId
    chains: tuple[PublicChain, ...]


def build_chains_router(*, registry: ChainRegistry) -> APIRouter:
    router = APIRouter(prefix="/api/v1/chains", tags=["chains"])

    @router.get("", response_model=ChainsResponse)
    async def list_chains() -> ChainsResponse:
        return ChainsResponse(
            default_chain_id=registry.default_chain_id,
            chains=tuple(
                PublicChain(
                    chain_id=chain.chain_id,
                    family=chain.family,
                    display_name=chain.display_name,
                    aliases=chain.aliases,
                    testnet=chain.testnet,
                    native_token=chain.native_token,
                    stablecoin=chain.stablecoin,
                    explorers=chain.explorers,
                    capabilities=chain.capabilities,
                )
                for chain in registry.chains
                if chain.enabled
            ),
        )

    return router
