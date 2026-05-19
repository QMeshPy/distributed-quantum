"""
Basescan URL Utility Module

Provides functions to generate Basescan block explorer URLs for transactions,
addresses, and blocks on the Base network (Ethereum L2 by Coinbase).

Supports:
- Base Sepolia (testnet): https://sepolia.basescan.org
- Base Mainnet: https://basescan.org
"""

import re
from typing import Literal

# Type alias for supported networks
NetworkType = Literal["base-sepolia", "base-mainnet"]

# Network to base URL mapping
NETWORK_URLS = {
    "base-sepolia": "https://sepolia.basescan.org",
    "base-mainnet": "https://basescan.org",
}

# Regex patterns for validation
TX_HASH_PATTERN = re.compile(r"^0x[a-fA-F0-9]{64}$")
ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")


def validate_network(network: str) -> None:
    """
    Validate that the network is supported.

    Args:
        network: Network identifier

    Raises:
        ValueError: If network is not supported
    """
    if network not in NETWORK_URLS:
        raise ValueError(
            f"Unsupported network: {network}. "
            f"Supported networks: {', '.join(NETWORK_URLS.keys())}"
        )


def validate_tx_hash(tx_hash: str) -> None:
    """
    Validate transaction hash format.

    Args:
        tx_hash: Transaction hash to validate

    Raises:
        ValueError: If tx_hash format is invalid
    """
    if not TX_HASH_PATTERN.match(tx_hash):
        raise ValueError(
            f"Invalid transaction hash format: {tx_hash}. "
            "Expected format: 0x followed by 64 hexadecimal characters"
        )


def validate_address(address: str) -> None:
    """
    Validate Ethereum address format.

    Args:
        address: Ethereum address to validate

    Raises:
        ValueError: If address format is invalid
    """
    if not ADDRESS_PATTERN.match(address):
        raise ValueError(
            f"Invalid address format: {address}. "
            "Expected format: 0x followed by 40 hexadecimal characters"
        )


def get_transaction_url(tx_hash: str, network: str = "base-sepolia") -> str:
    """
    Generate Basescan URL for a transaction.

    Args:
        tx_hash: Transaction hash (0x prefixed, 64 hex characters)
        network: Network identifier (default: "base-sepolia")

    Returns:
        Full Basescan URL for the transaction

    Raises:
        ValueError: If tx_hash or network is invalid

    Example:
        >>> get_transaction_url("0x1234...abcd", "base-sepolia")
        'https://sepolia.basescan.org/tx/0x1234...abcd'
    """
    validate_network(network)
    validate_tx_hash(tx_hash)

    base_url = NETWORK_URLS[network]
    return f"{base_url}/tx/{tx_hash}"


def get_address_url(address: str, network: str = "base-sepolia") -> str:
    """
    Generate Basescan URL for an address.

    Args:
        address: Ethereum address (0x prefixed, 40 hex characters)
        network: Network identifier (default: "base-sepolia")

    Returns:
        Full Basescan URL for the address

    Raises:
        ValueError: If address or network is invalid

    Example:
        >>> get_address_url("0xABCD...1234", "base-sepolia")
        'https://sepolia.basescan.org/address/0xABCD...1234'
    """
    validate_network(network)
    validate_address(address)

    base_url = NETWORK_URLS[network]
    return f"{base_url}/address/{address}"


def get_block_url(block_number: int, network: str = "base-sepolia") -> str:
    """
    Generate Basescan URL for a block.

    Args:
        block_number: Block number (must be non-negative)
        network: Network identifier (default: "base-sepolia")

    Returns:
        Full Basescan URL for the block

    Raises:
        ValueError: If block_number is negative or network is invalid

    Example:
        >>> get_block_url(12345, "base-sepolia")
        'https://sepolia.basescan.org/block/12345'
    """
    validate_network(network)

    if block_number < 0:
        raise ValueError(f"Block number must be non-negative, got: {block_number}")

    base_url = NETWORK_URLS[network]
    return f"{base_url}/block/{block_number}"
