"""Reviewed allowlist of tokenized assets whose Chainlink price history may be read.

The source may be a mainnet: it is used only for eth_call reads, never for wallets,
signing or transactions, and is kept outside the chain registry for that reason.
"""

from __future__ import annotations

import sys
from importlib.resources import files
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from quantum_backend_v2.chains.models import ChainId, EvmAddress, PublicRpcUrl

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

AssetSymbol = Annotated[str, Field(pattern=r"^[A-Z]{1,8}$")]


class _MarketDataModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)


class TokenizedAsset(_MarketDataModel):
    symbol: AssetSymbol
    name: str = Field(min_length=1, max_length=80, pattern=r"^\S(?:.*\S)?$")
    isin: str = Field(pattern=r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
    token_address: EvmAddress
    feed_address: EvmAddress
    # Compared with the feed's on-chain description() before every read.
    feed_description: str = Field(min_length=1, max_length=80)
    feed_decimals: int = Field(ge=0, le=18, strict=True)
    # Chainlink proxy round IDs are (phase_id << 64) | aggregator round.
    phase_id: int = Field(ge=1, lt=2**16, strict=True)
    first_valid_round: int = Field(ge=1, lt=2**64, strict=True)


class MarketDataSource(_MarketDataModel):
    chain_id: ChainId
    display_name: str = Field(min_length=1, max_length=80)
    rpc_env_var: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    public_rpc_url: PublicRpcUrl | None = None
    multicall_address: EvmAddress
    reviewed_block: int = Field(ge=0, strict=True)
    assets: tuple[TokenizedAsset, ...] = Field(min_length=2)

    @model_validator(mode="after")
    def validate_assets(self) -> MarketDataSource:
        for values in (
            [asset.symbol for asset in self.assets],
            [asset.token_address.lower() for asset in self.assets],
            [asset.feed_address.lower() for asset in self.assets],
        ):
            if len(set(values)) != len(values):
                raise ValueError("duplicate market-data asset")
        return self

    @property
    def numeric_chain_id(self) -> int:
        return int(self.chain_id.split(":")[1])

    def asset(self, symbol: str) -> TokenizedAsset:
        for asset in self.assets:
            if asset.symbol == symbol:
                return asset
        # Do not echo caller input.
        raise UnsupportedAssetError("unsupported asset")


class UnsupportedAssetError(ValueError):
    """The requested asset is not on the reviewed allowlist."""


class MarketDataConfigurationError(ValueError):
    """Invalid market-data configuration, with input values deliberately omitted."""


def load_market_data(path: str | Path | None = None) -> MarketDataSource:
    try:
        source = Path(path) if path is not None else files(__package__).joinpath("market_data.toml")
        with source.open("rb") as stream:
            data = tomllib.load(stream)
        return MarketDataSource.model_validate(data)
    except ValidationError as exc:
        errors = exc.errors(include_url=False, include_context=False, include_input=False)
        messages = "; ".join(dict.fromkeys(error["msg"] for error in errors))
        raise MarketDataConfigurationError(f"invalid market data: {messages}") from None
    except OSError:
        raise MarketDataConfigurationError("unable to read market data file") from None
    except ValueError:
        raise MarketDataConfigurationError("invalid market data TOML") from None
