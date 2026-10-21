"""ENS name resolution helpers.

Chain-agnostic surface for forward and reverse ENS lookups. Resolution always
targets Ethereum L1 (Sepolia when the payment network is a testnet), even when
funds move on an L2. The chain registry (#2) can later wrap this with a thin
adapter; until then callers pass an explicit SLIP-44 / ENSIP-11 coin type.

Never guesses an address on failure — callers must surface a clear error and
require user confirmation before sending funds (see issue #22).
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)

# SLIP-44 / ENSIP-9: Ethereum
COIN_TYPE_ETH = 60

# Default public RPCs for ENS (L1). Override with ENS_RPC_URL.
_DEFAULT_ENS_RPC = {
    "sepolia": "https://ethereum-sepolia-rpc.publicnode.com",
    "mainnet": "https://ethereum-rpc.publicnode.com",
}

# Cache TTL bounds (seconds)
_DEFAULT_CACHE_TTL = 300  # 5 minutes
_MAX_CACHE_TTL = 900  # 15 minutes hard cap
_DEFAULT_TIMEOUT = 8.0  # seconds

# Minimal name shape before ENS normalize: labels separated by dots.
_NAME_PATTERN = re.compile(
    r"^(?=.{3,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$",
    re.IGNORECASE,
)
_ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")

# Scripts that commonly appear in lookalike / homoglyph attacks mixed with Latin.
_CONFUSABLE_SCRIPT_NAMES = frozenset(
    {
        "CYRILLIC",
        "GREEK",
        "ARMENIAN",
        "GEORGIAN",
        "HEBREW",
        "ARABIC",
        "DEVANAGARI",
        "BENGALI",
        "THAI",
        "HANGUL",
        "HIRAGANA",
        "KATAKANA",
        "HAN",
    }
)

# Sentinel returned by ``_cache_get`` when the key is absent or expired.
_CACHE_MISS = object()


class EnsResolutionError(Exception):
    """Raised when a name cannot be resolved to an address.

    Callers must not fall back to a guessed address.
    """

    def __init__(self, message: str, *, name: str | None = None) -> None:
        super().__init__(message)
        self.name = name
        self.message = message


class EnsClient(Protocol):
    """Minimal ENS client surface used by EnsService (injectable for tests)."""

    def address(self, name: str, coin_type: int = COIN_TYPE_ETH) -> str | None: ...

    def name(self, address: str) -> str | None: ...


@dataclass(frozen=True)
class EnsResolveResult:
    """Successful forward resolution."""

    name: str
    address: str
    coin_type: int
    cached: bool


@dataclass(frozen=True)
class EnsReverseResult:
    """Successful reverse resolution (primary name may be absent)."""

    address: str
    name: str | None
    coin_type: int
    cached: bool


@dataclass
class _CacheEntry:
    value: str | None
    expires_at: float


def ens_network_for_payment_network(payment_network: str | None) -> str:
    """Map a payment / AgentKit network id to the ENS L1 network.

    ENS records live on Ethereum. Testnet payment chains resolve against Sepolia.
    """
    network = (payment_network or os.getenv("NETWORK", "base-sepolia")).lower()
    if "mainnet" in network and "sepolia" not in network:
        return "mainnet"
    return "sepolia"


def evm_coin_type(chain_id: int) -> int:
    """ENSIP-11 coin type for an EVM chain id (not used for ETH coin type 60)."""
    if chain_id == 1:
        return COIN_TYPE_ETH
    return 0x80000000 | chain_id


def looks_like_ens_name(value: str) -> bool:
    """True if ``value`` looks like a dotted name rather than a hex address."""
    candidate = (value or "").strip()
    if not candidate or _ADDRESS_PATTERN.match(candidate):
        return False
    return "." in candidate


def _script_name(char: str) -> str | None:
    try:
        name = unicodedata.name(char)
    except ValueError:
        return None
    # e.g. "CYRILLIC SMALL LETTER A" -> "CYRILLIC"
    return name.split(" ", 1)[0]


def detect_homoglyph_risk(name: str) -> str | None:
    """Return a reason string if ``name`` mixes Latin with confusable scripts.

    Pure ASCII / Latin names pass. Mixed-script names are rejected so we never
    resolve lookalikes that a user might confuse with a trusted name.
    """
    scripts: set[str] = set()
    for char in name:
        if char in ".-" or char.isascii() and (char.isalnum()):
            if char.isalpha():
                scripts.add("LATIN")
            continue
        if char.isascii():
            continue
        script = _script_name(char)
        if script:
            scripts.add(script)

    confusable = scripts & _CONFUSABLE_SCRIPT_NAMES
    if confusable and ("LATIN" in scripts or len(scripts) > 1):
        return (
            f"Name mixes scripts ({', '.join(sorted(scripts))}) and may be a "
            "lookalike; refusing to resolve"
        )
    if confusable and len(confusable) > 1:
        return (
            f"Name mixes confusable scripts ({', '.join(sorted(confusable))}); "
            "refusing to resolve"
        )
    return None


def normalize_ens_name(name: str) -> str:
    """Normalize and validate an ENS name.

    Raises:
        EnsResolutionError: if the name is empty, malformed, or homoglyph-risky.
    """
    raw = (name or "").strip()
    if not raw:
        raise EnsResolutionError("ENS name is empty", name=name)

    if _ADDRESS_PATTERN.match(raw):
        raise EnsResolutionError(
            "Expected an ENS name, got a hex address",
            name=name,
        )

    # Reject mixed-script lookalikes before calling ens (which may choke on
    # non-ASCII under some pyunormalize releases).
    risk = detect_homoglyph_risk(raw)
    if risk:
        raise EnsResolutionError(risk, name=name)

    # Prefer the ens package normalizer when available (UTS-46 / ENSIP-15).
    # Fall back for plain ASCII labels if ens/pyunormalize are missing or hit
    # a known NFC list/string incompatibility in some pyunormalize releases.
    normalized = raw.lower()
    try:
        from ens.utils import normalize_name  # type: ignore[import-untyped]

        normalized = normalize_name(raw)
    except ImportError:
        pass
    except Exception as exc:  # InvalidName and friends
        if raw.isascii() and "." in raw:
            logger.debug(
                "ens.normalize_name failed for ASCII name %r (%s); using lowercase",
                raw,
                exc,
            )
            normalized = raw.lower()
        else:
            raise EnsResolutionError(
                f"Invalid ENS name: {exc}",
                name=name,
            ) from exc

    if not _NAME_PATTERN.match(normalized):
        raise EnsResolutionError(
            f"Invalid ENS name format: {name!r}",
            name=name,
        )

    return normalized


class EnsService:
    """Resolve and reverse-resolve ENS names with caching and timeouts."""

    def __init__(
        self,
        *,
        rpc_url: str | None = None,
        ens_network: str | None = None,
        cache_ttl: float | None = None,
        timeout: float | None = None,
        ens_client: EnsClient | None = None,
    ) -> None:
        payment_network = os.getenv("NETWORK", "base-sepolia")
        self.ens_network = (ens_network or os.getenv("ENS_NETWORK") or ens_network_for_payment_network(payment_network)).lower()
        if self.ens_network not in _DEFAULT_ENS_RPC:
            raise ValueError(
                f"Unsupported ENS network: {self.ens_network}. "
                f"Supported: {', '.join(_DEFAULT_ENS_RPC)}"
            )

        self.rpc_url = (
            rpc_url
            or os.getenv("ENS_RPC_URL")
            or _DEFAULT_ENS_RPC[self.ens_network]
        )
        ttl = float(cache_ttl if cache_ttl is not None else os.getenv("ENS_CACHE_TTL", _DEFAULT_CACHE_TTL))
        self.cache_ttl = max(0.0, min(ttl, _MAX_CACHE_TTL))
        self.timeout = float(
            timeout if timeout is not None else os.getenv("ENS_RESOLVE_TIMEOUT", _DEFAULT_TIMEOUT)
        )

        self._ens: EnsClient | None = ens_client
        self._cache: dict[str, _CacheEntry] = {}
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ens")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def resolve(
        self,
        name: str,
        *,
        coin_type: int = COIN_TYPE_ETH,
        fresh: bool = False,
    ) -> EnsResolveResult:
        """Resolve ``name`` to an address for ``coin_type``.

        Args:
            name: ENS name (e.g. ``alice.eth``).
            coin_type: SLIP-44 / ENSIP-11 coin type (default ETH = 60).
            fresh: If True, bypass the cache (use before sending funds).

        Raises:
            EnsResolutionError: on invalid names, timeouts, or empty results.
        """
        normalized = normalize_ens_name(name)
        cache_key = f"fwd:{coin_type}:{normalized}"

        if not fresh:
            cached = self._cache_get(cache_key)
            if cached is not _CACHE_MISS:
                if cached == "":
                    raise EnsResolutionError(
                        f"No address found for {normalized}",
                        name=normalized,
                    )
                return EnsResolveResult(
                    name=normalized,
                    address=str(cached),
                    coin_type=coin_type,
                    cached=True,
                )

        address = self._call_with_timeout(
            self._resolve_uncached,
            normalized,
            coin_type,
            label=f"resolve({normalized})",
        )
        if not address:
            self._cache_set(cache_key, "")
            raise EnsResolutionError(
                f"No address found for {normalized}",
                name=normalized,
            )

        checksummed = self._checksum_address(address)
        self._cache_set(cache_key, checksummed)
        return EnsResolveResult(
            name=normalized,
            address=checksummed,
            coin_type=coin_type,
            cached=False,
        )

    def reverse(
        self,
        address: str,
        *,
        coin_type: int = COIN_TYPE_ETH,
        fresh: bool = False,
    ) -> EnsReverseResult:
        """Reverse-resolve a primary ENS name for ``address``.

        Returns ``name=None`` when no verified primary name is set (display
        should fall back to the address). Does not raise for "no name".
        """
        addr = (address or "").strip()
        if not _ADDRESS_PATTERN.match(addr):
            raise EnsResolutionError(
                f"Invalid address format: {address!r}",
                name=None,
            )
        addr = self._checksum_address(addr)
        cache_key = f"rev:{coin_type}:{addr.lower()}"

        if not fresh:
            cached = self._cache_get(cache_key)
            if cached is not _CACHE_MISS:
                return EnsReverseResult(
                    address=addr,
                    name=str(cached) if cached else None,
                    coin_type=coin_type,
                    cached=True,
                )

        primary = self._call_with_timeout(
            self._reverse_uncached,
            addr,
            coin_type,
            label=f"reverse({addr})",
        )
        # Store empty string for negative cache
        self._cache_set(cache_key, primary or "")
        return EnsReverseResult(
            address=addr,
            name=primary,
            coin_type=coin_type,
            cached=False,
        )

    def clear_cache(self) -> None:
        """Drop all cached resolutions."""
        with self._lock:
            self._cache.clear()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_ens(self) -> EnsClient:
        if self._ens is not None:
            return self._ens
        try:
            from ens import ENS  # type: ignore[import-untyped]
            from web3 import Web3  # type: ignore[import-untyped]
        except ImportError as exc:
            raise EnsResolutionError(
                "web3/ens packages are not installed; cannot resolve ENS names"
            ) from exc

        provider = Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": self.timeout})
        w3 = Web3(provider)
        self._ens = ENS.from_web3(w3)
        return self._ens

    def _resolve_uncached(self, name: str, coin_type: int) -> str | None:
        ens = self._get_ens()
        try:
            return ens.address(name, coin_type=coin_type)
        except TypeError:
            # Older ens clients may not accept coin_type
            if coin_type != COIN_TYPE_ETH:
                raise EnsResolutionError(
                    f"ENS client does not support coin_type={coin_type}",
                    name=name,
                )
            return ens.address(name)

    def _reverse_uncached(self, address: str, coin_type: int) -> str | None:
        # web3 ENS.name() verifies forward resolution for coin type 60.
        # ENSIP-19 multichain primary names are not fully exposed yet; for
        # non-ETH coin types we still call name() and verify forward ourselves.
        ens = self._get_ens()
        primary = ens.name(address)
        if not primary:
            return None
        try:
            forward = ens.address(primary, coin_type=coin_type)
        except TypeError:
            forward = ens.address(primary) if coin_type == COIN_TYPE_ETH else None
        if not forward:
            return None
        if forward.lower() != address.lower():
            logger.info(
                "ENS reverse name %s does not forward-resolve to %s (coin_type=%s); ignoring",
                primary,
                address,
                coin_type,
            )
            return None
        return primary

    def _call_with_timeout(self, fn: Any, *args: Any, label: str) -> Any:
        future = self._executor.submit(fn, *args)
        try:
            return future.result(timeout=self.timeout)
        except FuturesTimeoutError as exc:
            future.cancel()
            raise EnsResolutionError(
                f"ENS lookup timed out after {self.timeout:.0f}s ({label})"
            ) from exc
        except EnsResolutionError:
            raise
        except Exception as exc:
            logger.warning("ENS lookup failed (%s): %s", label, exc)
            raise EnsResolutionError(f"ENS lookup failed: {exc}") from exc

    def _cache_get(self, key: str) -> Any:
        """Return the cached string (possibly ``\"\"``) or ``_CACHE_MISS``."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return _CACHE_MISS
            if entry.expires_at < time.monotonic():
                del self._cache[key]
                return _CACHE_MISS
            return entry.value

    def _cache_set(self, key: str, value: str) -> None:
        if self.cache_ttl <= 0:
            return
        with self._lock:
            self._cache[key] = _CacheEntry(
                value=value,
                expires_at=time.monotonic() + self.cache_ttl,
            )

    @staticmethod
    def _checksum_address(address: str) -> str:
        try:
            from web3 import Web3  # type: ignore[import-untyped]

            return Web3.to_checksum_address(address)
        except Exception:
            # Keep lowercase hex if web3 is unavailable in tests
            if address.startswith("0x"):
                return "0x" + address[2:]
            return address


# Module-level singleton for routers (lazy).
_ens_service: EnsService | None = None
_ens_service_lock = threading.Lock()


def get_ens_service() -> EnsService:
    """Return a process-wide EnsService instance."""
    global _ens_service
    if _ens_service is None:
        with _ens_service_lock:
            if _ens_service is None:
                _ens_service = EnsService()
    return _ens_service


def set_ens_service(service: EnsService | None) -> None:
    """Override the process-wide EnsService (tests)."""
    global _ens_service
    with _ens_service_lock:
        _ens_service = service
