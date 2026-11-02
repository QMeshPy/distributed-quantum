"""Resolve a chain's JSON-RPC endpoint: environment override, then public default."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Protocol
from urllib.parse import urlsplit

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


class RpcConfigurationError(ValueError):
    """No usable RPC endpoint. Messages name the variable, never its value."""


class RpcEndpoint(Protocol):
    """A registry chain or read-only market-data source."""

    @property
    def rpc_env_var(self) -> str: ...

    @property
    def public_rpc_url(self) -> str | None: ...


def resolve_rpc_url(chain: RpcEndpoint, environ: Mapping[str, str] | None = None) -> str:
    """Return the RPC URL for ``chain``. The result may contain an API key: do not log it."""
    env = os.environ if environ is None else environ
    override = env.get(chain.rpc_env_var, "").strip()
    if override:
        try:
            parts = urlsplit(override)
            host = parts.hostname
        except ValueError:
            raise RpcConfigurationError(f"{chain.rpc_env_var} is not a valid URL") from None
        # Plain HTTP only for a local node, e.g. anvil or hardhat.
        if not host or not (
            parts.scheme == "https" or (parts.scheme == "http" and host in _LOCAL_HOSTS)
        ):
            raise RpcConfigurationError(
                f"{chain.rpc_env_var} must be an https URL, or http for a local node"
            )
        return override
    if chain.public_rpc_url is not None:
        return chain.public_rpc_url
    raise RpcConfigurationError(f"{chain.rpc_env_var} is not set and the chain has no public RPC")
