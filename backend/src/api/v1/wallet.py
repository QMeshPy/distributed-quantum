"""Wallet management router for CDP AgentKit wallet operations."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field, ConfigDict

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from db.agentkit_collections import WalletDocument, PaymentDocument
from quantum_backend_v2.api.deps.wallet import WalletService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class WalletCreateRequest(BaseModel):
    """Optional body for wallet creation."""

    model_config = ConfigDict(extra="forbid")

    network: str | None = Field(
        default=None,
        description="Registry alias or CAIP-2 id (e.g. arbitrum-sepolia). "
        "Defaults to the process wallet network.",
    )


class WalletCreateResponse(BaseModel):
    """Response from wallet creation."""

    model_config = ConfigDict(extra="forbid")

    wallet_id: str = Field(description="Unique wallet identifier")
    address: str = Field(description="Wallet address on the network")
    network: str = Field(description="Network name (e.g., base-sepolia)")


class WalletBalanceResponse(BaseModel):
    """Response containing wallet balance information."""

    model_config = ConfigDict(extra="forbid")

    usdc: str = Field(description="USDC balance (as string to preserve precision)")
    eth: str = Field(description="ETH balance (as string to preserve precision)")
    address: str = Field(default="", description="Wallet address on the network")
    network: str = Field(default="base-sepolia", description="Blockchain network")


class TransferRequest(BaseModel):
    """Request to transfer USDC to another wallet."""

    model_config = ConfigDict(extra="forbid")

    to_address: str = Field(min_length=1, description="Recipient wallet address")
    amount: str = Field(min_length=1, description="Amount to transfer (USDC)")


class TransferResponse(BaseModel):
    """Response from transfer operation."""

    model_config = ConfigDict(extra="forbid")

    payment_id: str = Field(description="Unique payment identifier")
    transaction_hash: str = Field(description="Blockchain transaction hash")
    basescan_url: str = Field(description="URL to view transaction on Basescan")


class FundTestnetResponse(BaseModel):
    """Response from testnet faucet request."""

    model_config = ConfigDict(extra="forbid")

    eth_transaction_hash: str | None = Field(description="ETH faucet transaction hash")
    eth_basescan_url: str | None = Field(description="Explorer URL for the ETH faucet transaction")
    usdc_transaction_hash: str | None = Field(description="USDC faucet transaction hash")
    usdc_basescan_url: str | None = Field(description="Explorer URL for the USDC faucet transaction")
    message: str = Field(description="Status message")


class TransactionItem(BaseModel):
    """Single transaction record."""

    model_config = ConfigDict(extra="forbid")

    transaction_hash: str = Field(description="Blockchain transaction hash")
    from_address: str = Field(description="Sender address")
    to_address: str = Field(description="Recipient address")
    amount: str = Field(description="Transaction amount")
    currency: str = Field(description="Currency (e.g., USDC, ETH)")
    status: str = Field(description="Transaction status")
    timestamp: str = Field(description="ISO 8601 timestamp")
    basescan_url: str = Field(description="Blockchain explorer URL")


class TransactionListResponse(BaseModel):
    """Response containing transaction history."""

    model_config = ConfigDict(extra="forbid")

    transactions: list[TransactionItem] = Field(default_factory=list)
    total: int = Field(description="Total number of transactions")


class ExportWalletResponse(BaseModel):
    """Response from wallet export operation."""

    model_config = ConfigDict(extra="forbid")

    seed_encrypted: str = Field(description="Encrypted wallet seed/mnemonic")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])


@router.post(
    "/create",
    response_model=WalletCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new wallet",
    description=(
        "Creates a new CDP wallet for the current user on a registry wallet network "
        "(Base Sepolia by default; pass network=arbitrum-sepolia for Arbitrum Sepolia)."
    ),
)
async def create_wallet(
    current_user: CurrentUser,
    agentkit_service: WalletService,
    body: WalletCreateRequest | None = None,
) -> WalletCreateResponse:
    """Create a new wallet for the current user on an enabled wallet-capable network."""
    try:
        # Check if user already has a wallet
        existing_wallet = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if existing_wallet:
            raise PlatformException(
                status_code=status.HTTP_409_CONFLICT,
                error=ErrorCode.VALIDATION_ERROR,
                message="User already has a wallet",
            )

        requested = body.network if body is not None else None
        wallet_data = await agentkit_service.create_wallet(
            entity_id=current_user.user_id,
            entity_type="user",
            network=requested,
        )

        return WalletCreateResponse(
            wallet_id=wallet_data.get("wallet_id") or wallet_data["wallet_address"][:8],
            address=wallet_data["wallet_address"],
            network=wallet_data["network_id"]
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid input for wallet creation: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to create wallet for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to create wallet",
        )


@router.get(
    "/balance",
    response_model=WalletBalanceResponse,
    status_code=status.HTTP_200_OK,
    summary="Get wallet balance",
    description="Retrieves the current USDC and ETH balances for the user's wallet.",
)
async def get_balance(
    current_user: CurrentUser,
    agentkit_service: WalletService,
) -> WalletBalanceResponse:
    """Get the current wallet balance.

    Returns the USDC and ETH balances for the authenticated user's wallet.
    Balances are returned as strings to preserve decimal precision.

    Args:
        current_user: Authenticated user from dependency injection

    Returns:
        WalletBalanceResponse with usdc and eth balances

    Raises:
        PlatformException: If wallet not found or balance query fails
    """
    try:
        # Get user's wallet from database
        wallet_doc = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if not wallet_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Wallet not found. Please create a wallet first.",
            )

        agentkit_service.validate_wallet_network(wallet_doc.network)
        service = agentkit_service.for_network(wallet_doc.network)
        balance_data = await service.get_balance(wallet_doc.default_address)

        return WalletBalanceResponse(
            usdc=str(balance_data["usdc_balance"]),
            eth=str(balance_data["eth_balance"]),
            address=wallet_doc.default_address,
            network=wallet_doc.network,
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid wallet address: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to get balance for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve wallet balance",
        )


@router.post(
    "/transfer",
    response_model=TransferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Transfer USDC",
    description="Sends USDC from the user's wallet to another address.",
)
async def transfer_usdc(
    body: TransferRequest,
    current_user: CurrentUser,
    agentkit_service: WalletService,
) -> TransferResponse:
    """Transfer USDC to another wallet address.

    Executes a USDC transfer from the authenticated user's wallet to the
    specified recipient address on Base Sepolia.

    Args:
        body: Transfer request with to_address and amount
        current_user: Authenticated user from dependency injection

    Returns:
        TransferResponse with payment_id, transaction_hash, and basescan_url

    Raises:
        PlatformException: If wallet not found, insufficient balance, or transfer fails
    """
    # TODO: Add rate limiting for production (comment for future)
    try:
        # Get user's wallet from database
        wallet_doc = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if not wallet_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Wallet not found. Please create a wallet first.",
            )

        agentkit_service.validate_wallet_network(wallet_doc.network)
        service = agentkit_service.for_network(wallet_doc.network)
        # Convert amount string to Decimal for precision
        amount = Decimal(body.amount)

        # Prepare metadata
        metadata = {
            "initiated_by": current_user.user_id,
            "user_email": current_user.email,
        }

        # Execute transfer via AgentKit service on the wallet's stored network
        transfer_result = await service.transfer_usdc(
            from_address=wallet_doc.default_address,
            to_address=body.to_address,
            amount=amount,
            metadata=metadata
        )

        basescan_url = service.explorer.explorer_url(
            "transaction", transfer_result["transaction_hash"]
        )

        return TransferResponse(
            payment_id=transfer_result.get("payment_id", transfer_result["transaction_hash"]),
            transaction_hash=transfer_result["transaction_hash"],
            basescan_url=basescan_url
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid transfer parameters: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to transfer USDC for user {current_user.user_id}: {e}")
        # Check for common error patterns
        error_msg = str(e).lower()
        if "insufficient" in error_msg or "balance" in error_msg:
            raise PlatformException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error=ErrorCode.VALIDATION_ERROR,
                message="Insufficient balance for transfer",
            )
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to execute transfer",
        )


@router.post(
    "/fund-testnet",
    response_model=FundTestnetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request testnet faucet funds",
    description="Requests test ETH and USDC from the CDP faucet for the wallet's network.",
)
async def fund_testnet_wallet(
    current_user: CurrentUser,
    agentkit_service: WalletService,
) -> FundTestnetResponse:
    """Request funds from the CDP testnet faucet for the wallet's network.

    Requests test ETH and USDC from the CDP faucet for the authenticated user's
    wallet. A token the faucet rejects is omitted. This endpoint is only
    available on testnet networks.

    Args:
        current_user: Authenticated user from dependency injection

    Returns:
        FundTestnetResponse with transaction_hash and status message

    Raises:
        PlatformException: If wallet not found or faucet request fails
    """
    try:
        # Get user's wallet from database
        wallet_doc = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if not wallet_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Wallet not found. Please create a wallet first.",
            )

        agentkit_service.validate_wallet_network(wallet_doc.network)
        service = agentkit_service.for_network(wallet_doc.network)

        # Request testnet funds via AgentKit service
        faucet_result = await service.request_testnet_funds(wallet_doc.default_address)

        return FundTestnetResponse(
            eth_transaction_hash=faucet_result["eth_transaction_hash"],
            eth_basescan_url=faucet_result["eth_basescan_url"],
            usdc_transaction_hash=faucet_result["usdc_transaction_hash"],
            usdc_basescan_url=faucet_result["usdc_basescan_url"],
            message=faucet_result["message"],
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid faucet request: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to request testnet funds for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to request testnet funds",
        )


@router.get(
    "/transactions",
    response_model=TransactionListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get transaction history",
    description="Retrieves the transaction history for the user's wallet.",
)
async def get_transactions(
    current_user: CurrentUser,
    agentkit_service: WalletService,
    limit: int = Query(default=50, ge=1, le=200, description="Maximum number of transactions to return"),
) -> TransactionListResponse:
    """Get transaction history for the user's wallet.

    Returns a paginated list of transactions associated with the authenticated
    user's wallet, including both incoming and outgoing transfers.

    Args:
        current_user: Authenticated user from dependency injection
        limit: Maximum number of transactions to return (1-200, default 50)

    Returns:
        TransactionListResponse with list of transactions and total count

    Raises:
        PlatformException: If wallet not found or transaction query fails
    """
    try:
        # Get user's wallet from database
        wallet_doc = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if not wallet_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Wallet not found. Please create a wallet first.",
            )

        agentkit_service.validate_wallet_network(wallet_doc.network)
        service = agentkit_service.for_network(wallet_doc.network)
        service.require_operation("get_balance")
        explorer = service.explorer

        # Query transactions where user's wallet is either sender or recipient
        transactions = await PaymentDocument.find(
            {
                "$or": [
                    {"from_wallet": wallet_doc.default_address},
                    {"to_wallet": wallet_doc.default_address}
                ]
            }
        ).sort([("created_at", -1)]).limit(limit).to_list()

        # Count total transactions for pagination info
        total_count = await PaymentDocument.find(
            {
                "$or": [
                    {"from_wallet": wallet_doc.default_address},
                    {"to_wallet": wallet_doc.default_address}
                ]
            }
        ).count()

        # Format internal transactions
        seen_hashes: set[str] = set()
        transaction_items = []
        for payment in transactions:
            basescan_url = (
                explorer.explorer_url("transaction", payment.transaction_hash)
                if payment.transaction_hash else ""
            )
            transaction_items.append(
                TransactionItem(
                    transaction_hash=payment.transaction_hash or "pending",
                    from_address=payment.from_wallet,
                    to_address=payment.to_wallet,
                    amount=str(payment.amount.to_decimal()),
                    currency=payment.currency,
                    status=payment.status,
                    timestamp=payment.created_at.isoformat(),
                    basescan_url=basescan_url or "",
                )
            )
            if payment.transaction_hash:
                seen_hashes.add(payment.transaction_hash)

        # Augment with on-chain ERC-20 Transfer logs via RPC (no API key needed)
        try:
            import asyncio as _asyncio
            from web3 import Web3 as _Web3
            from quantum_backend_v2.chains.adapter import TRANSFER_TOPIC
            from quantum_backend_v2.chains.rpc import resolve_rpc_url

            _w3 = _Web3(_Web3.HTTPProvider(resolve_rpc_url(agentkit_service.chain)))

            usdc_address = agentkit_service.usdc_address

            addr = wallet_doc.default_address
            addr_padded = "0x" + addr[2:].lower().zfill(64)

            latest_block = _w3.eth.block_number
            # Start from creation_block if stored, else fall back to last ~50k blocks (~1 day)
            start_block = wallet_doc.creation_block if wallet_doc.creation_block else max(0, latest_block - 50_000)

            CHUNK = 2000
            all_logs: list = []

            # Scan in chunks to respect the RPC 2000-block limit
            def _fetch_chunks(from_b: int, to_b: int) -> list:
                logs = []
                for chunk_start in range(from_b, to_b + 1, CHUNK):
                    chunk_end = min(chunk_start + CHUNK - 1, to_b)
                    params = {
                        "fromBlock": chunk_start,
                        "toBlock": chunk_end,
                        "address": _Web3.to_checksum_address(usdc_address),
                    }
                    # Outgoing
                    logs += _w3.eth.get_logs({**params, "topics": [TRANSFER_TOPIC, addr_padded]})
                    # Incoming
                    logs += _w3.eth.get_logs({**params, "topics": [TRANSFER_TOPIC, None, addr_padded]})
                return logs

            # Run in executor so we don't block the event loop
            loop = _asyncio.get_event_loop()
            all_logs = await loop.run_in_executor(None, _fetch_chunks, start_block, latest_block)

            seen_hashes = {t.transaction_hash for t in transaction_items}

            for log in all_logs:
                tx_hash = _Web3.to_hex(log["transactionHash"])
                if tx_hash in seen_hashes:
                    continue
                seen_hashes.add(tx_hash)

                # Decode Transfer(from, to, value)
                from_addr = "0x" + log["topics"][1].hex()[-40:]
                to_addr   = "0x" + log["topics"][2].hex()[-40:]
                raw_value = int(log["data"].hex(), 16)
                usdc_amount = str(Decimal(raw_value) / agentkit_service.token_scale)

                # Get block timestamp
                try:
                    block = _w3.eth.get_block(log["blockNumber"])
                    ts = __import__("datetime").datetime.utcfromtimestamp(block["timestamp"]).isoformat()
                except Exception:
                    ts = ""

                direction = "out" if from_addr.lower() == addr.lower() else "in"
                transaction_items.append(TransactionItem(
                    transaction_hash=tx_hash,
                    from_address=_Web3.to_checksum_address(from_addr),
                    to_address=_Web3.to_checksum_address(to_addr),
                    amount=usdc_amount,
                    currency="USDC",
                    status="confirmed",
                    timestamp=ts,
                    basescan_url=explorer.explorer_url("transaction", tx_hash),
                ))

        except Exception as rpc_err:
            # Log the type only: RPC errors can embed an API-keyed endpoint URL.
            logger.warning(f"On-chain log scan failed: {type(rpc_err).__name__}")

        # Sort all by timestamp descending
        transaction_items.sort(key=lambda t: t.timestamp, reverse=True)
        transaction_items = transaction_items[:limit]

        return TransactionListResponse(
            transactions=transaction_items,
            total=len(transaction_items),
        )

    except PlatformException:
        raise
    except ValueError as e:
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        ) from e
    except Exception as e:
        logger.error(f"Failed to get transactions for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve transaction history",
        )


@router.post(
    "/export",
    response_model=ExportWalletResponse,
    status_code=status.HTTP_200_OK,
    summary="Export wallet seed",
    description="Exports the encrypted wallet seed/mnemonic for backup purposes.",
)
async def export_wallet(
    current_user: CurrentUser,
) -> ExportWalletResponse:
    """Export the encrypted wallet seed.

    Returns the encrypted seed/mnemonic for the authenticated user's wallet.
    This should be stored securely by the user for wallet recovery purposes.

    SECURITY WARNING: The seed is returned in encrypted form. Users must store
    this securely and never share it. Loss of the seed means loss of wallet access.

    Args:
        current_user: Authenticated user from dependency injection

    Returns:
        ExportWalletResponse with encrypted seed

    Raises:
        PlatformException: If wallet not found or export fails
    """
    try:
        # Get user's wallet from database
        wallet_doc = await WalletDocument.find_one(
            {"entity_id": current_user.user_id, "entity_type": "user"}
        )
        if not wallet_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Wallet not found. Please create a wallet first.",
            )

        # Return encrypted seed (never plaintext for security)
        # The seed is already stored encrypted in the database
        logger.info(
            f"Wallet export requested by user {current_user.user_id} "
            f"(wallet: {wallet_doc.default_address})"
        )

        return ExportWalletResponse(
            seed_encrypted=wallet_doc.seed_encrypted
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to export wallet for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to export wallet",
        )
