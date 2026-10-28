"""
AgentKit Service - Wallet Management and USDC Transfers

This service provides integration with Coinbase AgentKit for:
- Wallet creation and management
- USDC balance queries and transfers
- Aave protocol integration for escrow functionality
- Testnet faucet requests

SDK: coinbase-agentkit Python package
"""

from decimal import Decimal
from datetime import datetime
from typing import Any, Optional
import logging
import asyncio
import concurrent.futures
import os
import uuid
from cryptography.fernet import Fernet
import base64
import hashlib

from quantum_backend_v2.chains.adapter import (
    EvmExplorerAdapter,
    EvmRpcAdapter,
    UnsupportedOperationError,
)
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.models import Capability, ChainRegistry, ChainSpec
from quantum_backend_v2.chains.rpc import resolve_rpc_url
from quantum_backend_v2.config import load_settings

logger = logging.getLogger(__name__)

# Core deps used even when CDP/AgentKit is incomplete (do not bundle with CDP imports).
try:
    from web3 import Web3
except ImportError:  # pragma: no cover
    Web3 = Any  # type: ignore[misc, assignment]

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:  # pragma: no cover
    AsyncIOMotorClient = Any  # type: ignore[misc, assignment]

# AgentKit / CDP imports (optional for local API bring-up)
try:
    from cdp import CdpClient
    # Wallet providers only; do not register AgentKit's automatic x402 actions.
    from coinbase_agentkit.wallet_providers import CdpEvmWalletProvider, CdpEvmWalletProviderConfig
except ImportError as e:
    # Fallback for development without full SDK installed
    logger.warning(f"AgentKit SDK not fully available: {e}")
    CdpClient = Any
    CdpEvmWalletProvider = Any
    CdpEvmWalletProviderConfig = Any

# Import MongoDB models
from db.agentkit_collections import (
    WalletDocument,
    PaymentDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)
from utils.basescan import validate_address
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.models import PaymentPurpose, PaymentRail
from services.payment_events import confirm_quietly, settle_failed_send


class AgentKitService:
    """
    Service for managing crypto wallets and USDC transfers using Coinbase AgentKit.

    Handles wallet lifecycle, balance queries, USDC transfers, and Aave escrow operations
    for the quantum computing node marketplace.
    """

    def __init__(
        self, *, registry: ChainRegistry | None = None, network: str | None = None
    ) -> None:
        """
        Initialize AgentKit service with CDP credentials.

        Loads credentials from environment variables:
        - CDP_API_KEY_ID
        - CDP_API_KEY_SECRET
        - CDP_WALLET_SECRET
        - NETWORK (default: base-sepolia)
        - MONGODB_URI
        - MONGODB_DATABASE
        """
        if registry is None:
            settings = load_settings()
            registry = load_chain_registry(settings.chain_registry_path)
            if network is None:
                network = settings.wallet_network
        self.registry = registry
        self._chain = registry.resolve(network)
        self.explorer = EvmExplorerAdapter(self.chain)
        logger.info("Initializing AgentKitService")

        # Official CDP names only. A second pair in the same file is ignored.
        self.api_key_id = os.getenv("CDP_API_KEY_ID")
        self.api_key_secret = os.getenv("CDP_API_KEY_SECRET")
        self.wallet_secret = os.getenv("CDP_WALLET_SECRET")

        if not self.api_key_id or not self.api_key_secret or not self.wallet_secret:
            logger.warning("CDP credentials not configured - wallet operations will fail")

        # Initialize encryption key for wallet seeds (derived from secret key)
        self._init_encryption_key()

        # Initialize MongoDB connection
        mongodb_uri = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
        mongodb_database = os.getenv("QB2_MONGODB_DATABASE", "qds")
        self.mongo_client = AsyncIOMotorClient(mongodb_uri)
        self.db = self.mongo_client[mongodb_database]
        self._ledger: Optional[LedgerService] = None

        logger.info("AgentKitService configured for %s", self.chain.chain_id)

    @property
    def ledger(self) -> LedgerService:
        # Built on first use so constructing the service touches no collections
        if self._ledger is None:
            self._ledger = LedgerService(self.db)
        return self._ledger

    @property
    def chain(self) -> ChainSpec:
        return self._chain

    @property
    def network_id(self) -> str:
        alias = self.chain.provider_aliases.agentkit
        if alias is None:
            raise UnsupportedOperationError("AgentKit network mapping is unavailable")
        return alias

    @property
    def usdc_address(self) -> str:
        if self.chain.stablecoin is None:
            raise UnsupportedOperationError("USDC metadata is unavailable")
        return self.chain.stablecoin.address

    @property
    def token_scale(self) -> Decimal:
        if self.chain.stablecoin is None:
            raise UnsupportedOperationError("USDC metadata is unavailable")
        return Decimal(10 ** self.chain.stablecoin.decimals)

    @property
    def aave_pool_address(self) -> str:
        if self.chain.aave_pool_address is None:
            raise UnsupportedOperationError("Aave pool is unavailable")
        return self.chain.aave_pool_address

    def rpc_client(self) -> Web3:
        """Web3 client for the wallet network. Its URL may carry an API key: never log it."""
        return Web3(Web3.HTTPProvider(resolve_rpc_url(self.chain)))

    def require_operation(self, operation: Capability) -> None:
        if operation not in self.chain.capabilities:
            raise UnsupportedOperationError("wallet operation is unavailable on this network")

    def validate_wallet_network(self, network: str | None) -> ChainSpec:
        if network is None:
            raise ValueError("stored wallet network is missing")
        chain = self.registry.resolve(network)
        if chain.chain_id != self.chain.chain_id:
            raise ValueError("stored wallet network does not match the configured wallet network")
        return chain

    async def _validate_stored_wallet(self, wallet_address: str) -> None:
        wallet = await self.db.wallets.find_one({"default_address": wallet_address})
        if not wallet:
            raise ValueError("Wallet not found")
        self.validate_wallet_network(wallet.get("network"))

    def _init_encryption_key(self) -> None:
        """Initialize Fernet encryption key for wallet seed encryption."""
        # Derive a consistent key from the API secret (or use a dedicated WALLET_ENCRYPTION_KEY)
        secret = os.getenv("WALLET_ENCRYPTION_KEY", self.api_key_secret or "default-key-change-me")
        # Use SHA256 to derive a 32-byte key, then base64 encode for Fernet
        key_bytes = hashlib.sha256(secret.encode()).digest()
        self.fernet = Fernet(base64.urlsafe_b64encode(key_bytes))

    async def create_wallet(self, entity_id: str, entity_type: str) -> dict:
        """
        Create a new wallet for an entity (user, node, or platform).

        Args:
            entity_id: Unique identifier for the entity (user_id, node_id, or 'platform')
            entity_type: Type of entity ('user', 'agent', or 'worker')

        Returns:
            dict: Wallet information containing:
                - wallet_address: The wallet's blockchain address
                - entity_id: Associated entity identifier
                - entity_type: Type of entity
                - created_at: Timestamp of creation
                - network_id: Blockchain network identifier

        Raises:
            ValueError: If entity_type is invalid
            Exception: If wallet creation fails
        """
        logger.info(f"Creating wallet for {entity_type}:{entity_id}")
        try:
            self.require_operation("create_wallet")
            # Validate entity_type
            valid_types = ["user", "agent", "worker"]
            if entity_type not in valid_types:
                raise ValueError(f"Invalid entity_type '{entity_type}'. Must be one of: {valid_types}")

            # Check if wallet already exists
            existing = await self.db.wallets.find_one({"entity_id": entity_id})
            if existing:
                self.validate_wallet_network(existing.get("network"))
                logger.warning(f"Wallet already exists for {entity_type}:{entity_id}")
                return {
                    "wallet_address": existing["default_address"],
                    "entity_id": existing["entity_id"],
                    "entity_type": existing["entity_type"],
                    "created_at": existing["created_at"],
                    "network_id": existing["network"],
                }

            # Create wallet using CDP SDK
            # SDK's _run_async handles the event loop internally (new thread + new loop)
            config = CdpEvmWalletProviderConfig(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                wallet_secret=self.wallet_secret,
                network_id=self.network_id,
            )
            wallet_provider = await asyncio.get_event_loop().run_in_executor(
                None, lambda: CdpEvmWalletProvider(config)
            )
            wallet_address = wallet_provider.get_address()
            logger.info(f"Created wallet {wallet_address} for {entity_type}:{entity_id}")
            seed_encrypted = self.fernet.encrypt((self.wallet_secret or "").encode()).decode()

            # Record current block number so we can scan from here in transaction history
            try:
                creation_block: int | None = self.rpc_client().eth.block_number
            except Exception:
                creation_block = None

            # Create WalletDocument
            wallet_doc = WalletDocument(
                entity_id=entity_id,
                entity_type=entity_type,
                wallet_id=wallet_address[:8],  # Short identifier from address
                default_address=wallet_address,
                network=self.network_id,
                seed_encrypted=seed_encrypted,
                balance_usdc=_decimal_to_decimal128(Decimal("0")),
                balance_eth=_decimal_to_decimal128(Decimal("0")),
                creation_block=creation_block,
            )

            # Save to MongoDB
            await self.db.wallets.insert_one(wallet_doc.model_dump())

            logger.info(f"Wallet {wallet_address} saved to database for {entity_type}:{entity_id}")

            # Request testnet funds if in development mode
            if "faucet_instructions" in self.chain.capabilities:
                try:
                    await self.request_testnet_funds(wallet_address)
                except Exception as faucet_error:
                    logger.warning(f"Failed to request testnet funds: {faucet_error}")

            return {
                "wallet_address": wallet_address,
                "entity_id": entity_id,
                "entity_type": entity_type,
                "created_at": wallet_doc.created_at,
                "network_id": self.network_id,
            }

        except Exception as e:
            logger.error(f"Failed to create wallet for {entity_type}:{entity_id}: {e}")
            raise

    async def get_balance(self, wallet_address: str) -> dict:
        """
        Get USDC and ETH balances for a wallet.

        Args:
            wallet_address: The wallet's blockchain address

        Returns:
            dict: Balance information containing:
                - wallet_address: The queried wallet address
                - usdc_balance: USDC balance as Decimal
                - eth_balance: ETH balance as Decimal (for gas fees)
                - timestamp: Query timestamp
                - network_id: Blockchain network

        Raises:
            ValueError: If wallet_address is invalid
            Exception: If balance query fails
        """
        logger.info(f"Fetching balance for wallet {wallet_address}")
        try:
            self.require_operation("get_balance")
            validate_address(wallet_address)
            await self._validate_stored_wallet(wallet_address)

            # Read-only, through the registry RPC; no CDP credentials needed.
            balance = EvmRpcAdapter(self.chain, self.rpc_client()).get_balance(wallet_address)
            if balance.stablecoin is None:
                raise UnsupportedOperationError("USDC metadata is unavailable")
            eth_balance = balance.native
            usdc_balance = balance.stablecoin

            timestamp = datetime.utcnow()

            # Update balances in MongoDB
            await self.db.wallets.update_one(
                {"default_address": wallet_address},
                {
                    "$set": {
                        "balance_usdc": _decimal_to_decimal128(usdc_balance),
                        "balance_eth": _decimal_to_decimal128(eth_balance),
                        "updated_at": timestamp,
                    }
                }
            )

            logger.info(
                f"Balance for {wallet_address}: {usdc_balance} USDC, {eth_balance} ETH"
            )

            return {
                "wallet_address": wallet_address,
                "usdc_balance": usdc_balance,
                "eth_balance": eth_balance,
                "timestamp": timestamp,
                "network_id": self.network_id,
            }

        except Exception as e:
            # RPC errors can embed the endpoint URL, which may carry an API key.
            logger.error(f"Failed to get balance for {wallet_address}: {type(e).__name__}")
            raise

    async def transfer_usdc(
        self,
        from_address: str,
        to_address: str,
        amount: Decimal,
        metadata: Optional[dict] = None,
        purpose: PaymentPurpose = PaymentPurpose.TRANSFER,
    ) -> dict:
        """
        Execute a USDC transfer between wallets.

        Args:
            from_address: Source wallet address
            to_address: Destination wallet address
            amount: Amount of USDC to transfer (as Decimal)
            metadata: Optional transaction metadata (e.g., job_id, purpose)
            purpose: What the payment event records the transfer as

        Returns:
            dict: Transaction result containing:
                - transaction_hash: Blockchain transaction hash
                - from_address: Source wallet
                - to_address: Destination wallet
                - amount: Transfer amount
                - status: Transaction status
                - timestamp: Transaction timestamp
                - basescan_url: Block explorer URL
                - metadata: Associated metadata

        Raises:
            ValueError: If addresses or amount are invalid
            Exception: If wallet has insufficient balance or transfer fails
        """
        logger.info(f"Transferring {amount} USDC from {from_address} to {to_address}")
        try:
            self.require_operation("transfer_stablecoin")
            # Validate addresses and amount
            validate_address(from_address)
            validate_address(to_address)
            if amount <= 0:
                raise ValueError(f"Transfer amount must be positive, got: {amount}")

            # Load source wallet from MongoDB
            wallet_provider = await self._load_wallet(from_address)

            # Check balances
            balance_info = await self.get_balance(from_address)
            usdc_balance = balance_info["usdc_balance"]
            eth_balance = balance_info["eth_balance"]

            if usdc_balance < amount:
                raise ValueError(
                    f"Insufficient USDC balance. Required: {amount}, Available: {usdc_balance}"
                )

            # Estimate gas requirement (rough check for ETH balance)
            min_eth_for_gas = Decimal("0.0001")  # Minimum ETH needed for gas
            if eth_balance < min_eth_for_gas:
                raise ValueError(
                    f"Insufficient ETH for gas fees. Required: ~{min_eth_for_gas}, Available: {eth_balance}"
                )

            # Execute ERC-20 transfer
            # Standard ERC-20 transfer ABI
            erc20_transfer_abi = [
                {
                    "constant": False,
                    "inputs": [
                        {"name": "_to", "type": "address"},
                        {"name": "_value", "type": "uint256"}
                    ],
                    "name": "transfer",
                    "outputs": [{"name": "", "type": "bool"}],
                    "type": "function",
                }
            ]

            web3 = wallet_provider._web3
            usdc_contract = web3.eth.contract(
                address=Web3.to_checksum_address(self.usdc_address),
                abi=erc20_transfer_abi
            )

            amount_raw = int(amount * self.token_scale)

            # Build transaction
            function_call = usdc_contract.functions.transfer(
                Web3.to_checksum_address(to_address),
                amount_raw
            )
            tx_data = function_call.build_transaction({
                "from": Web3.to_checksum_address(from_address),
                "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(from_address)),
            })

            # Record the payment before sending so an interrupted send is
            # reconciled instead of silently retried
            payment_key = (metadata or {}).get("idempotency_key") or f"transfer:{uuid.uuid4()}"
            recorded = await self.ledger.record_event(
                idempotency_key=payment_key,
                rail=PaymentRail.ONCHAIN,
                purpose=purpose,
                amount=amount,
                chain_id=self.chain.chain_id,
                payer_ref=from_address,
                payee_ref=to_address,
                job_id=metadata.get("job_id") if metadata else None,
                proposal_id=metadata.get("proposal_id") if metadata else None,
                metadata={"payment_type": metadata.get("type", "other") if metadata else "other"},
            )
            if not recorded.created:
                raise ValueError(
                    f"Payment {payment_key} was already attempted "
                    f"(status: {recorded.event.status.value})"
                )

            # Send transaction via CDP wallet provider
            try:
                tx_hash = wallet_provider.send_transaction(tx_data)
            except Exception as send_error:
                await settle_failed_send(self.ledger, payment_key, send_error)
                raise

            logger.info(f"USDC transfer transaction sent: {tx_hash}")
            await confirm_quietly(self.ledger, payment_key, tx_hash)

            # Generate Basescan URL
            basescan_url = self.explorer.explorer_url("transaction", tx_hash)

            timestamp = datetime.utcnow()

            # Record transaction in database
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type=metadata.get("type", "other") if metadata else "other",
                from_wallet=from_address,
                to_wallet=to_address,
                amount=_decimal_to_decimal128(amount),
                currency="USDC",
                status="submitted",
                job_id=metadata.get("job_id") if metadata else None,
                proposal_id=metadata.get("proposal_id") if metadata else None,
                transaction_hash=tx_hash,
                basescan_url=basescan_url,
                created_at=timestamp,
            )

            await self.db.payments.insert_one(payment_doc.model_dump())

            logger.info(f"Payment {payment_id} recorded in database")

            # Update wallet balances (optimistic update)
            await self.get_balance(from_address)

            return {
                "transaction_hash": tx_hash,
                "from_address": from_address,
                "to_address": to_address,
                "amount": amount,
                "status": "submitted",
                "timestamp": timestamp,
                "basescan_url": basescan_url,
                "metadata": metadata or {},
            }

        except Exception as e:
            logger.error(f"Failed to transfer USDC: {e}")
            raise

    async def aave_supply(
        self,
        wallet_address: str,
        amount: Decimal,
        on_behalf_of: str
    ) -> dict:
        """
        Supply USDC to Aave protocol (escrow deposit).

        This is used to lock funds in escrow during job execution.

        Args:
            wallet_address: Wallet supplying the USDC
            amount: Amount of USDC to supply
            on_behalf_of: Address that will receive aTokens (typically same as wallet_address)

        Returns:
            dict: Supply transaction result containing:
                - transaction_hash: Blockchain transaction hash
                - wallet_address: Supplier wallet
                - amount: Supplied amount
                - on_behalf_of: aToken recipient
                - status: Transaction status
                - timestamp: Transaction timestamp
                - basescan_url: Block explorer URL

        Raises:
            ValueError: If parameters are invalid
            Exception: If wallet has insufficient balance or supply fails
        """
        logger.info(f"Supplying {amount} USDC to Aave from {wallet_address}")
        try:
            self.require_operation("aave_supply")
            # Validate addresses
            validate_address(wallet_address)
            validate_address(on_behalf_of)
            if amount <= 0:
                raise ValueError(f"Supply amount must be positive, got: {amount}")

            # Load wallet
            wallet_provider = await self._load_wallet(wallet_address)
            web3 = wallet_provider._web3

            # Check USDC balance
            balance_info = await self.get_balance(wallet_address)
            if balance_info["usdc_balance"] < amount:
                raise ValueError(
                    f"Insufficient USDC balance. Required: {amount}, Available: {balance_info['usdc_balance']}"
                )

            amount_raw = int(amount * self.token_scale)

            # Step 1: Approve USDC spending by Aave pool
            erc20_approve_abi = [
                {
                    "constant": False,
                    "inputs": [
                        {"name": "_spender", "type": "address"},
                        {"name": "_value", "type": "uint256"}
                    ],
                    "name": "approve",
                    "outputs": [{"name": "", "type": "bool"}],
                    "type": "function",
                }
            ]

            usdc_contract = web3.eth.contract(
                address=Web3.to_checksum_address(self.usdc_address),
                abi=erc20_approve_abi
            )

            approve_tx = usdc_contract.functions.approve(
                Web3.to_checksum_address(self.aave_pool_address),
                amount_raw
            ).build_transaction({
                "from": Web3.to_checksum_address(wallet_address),
                "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(wallet_address)),
            })

            approve_tx_hash = wallet_provider.send_transaction(approve_tx)
            logger.info(f"USDC approval transaction sent: {approve_tx_hash}")

            # Step 2: Execute Aave supply
            # Aave V3 Pool supply function ABI
            aave_supply_abi = [
                {
                    "inputs": [
                        {"internalType": "address", "name": "asset", "type": "address"},
                        {"internalType": "uint256", "name": "amount", "type": "uint256"},
                        {"internalType": "address", "name": "onBehalfOf", "type": "address"},
                        {"internalType": "uint16", "name": "referralCode", "type": "uint16"}
                    ],
                    "name": "supply",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ]

            aave_pool = web3.eth.contract(
                address=Web3.to_checksum_address(self.aave_pool_address),
                abi=aave_supply_abi
            )

            supply_tx = aave_pool.functions.supply(
                Web3.to_checksum_address(self.usdc_address),
                amount_raw,
                Web3.to_checksum_address(on_behalf_of),
                0  # referralCode
            ).build_transaction({
                "from": Web3.to_checksum_address(wallet_address),
                "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(wallet_address)),
            })

            tx_hash = wallet_provider.send_transaction(supply_tx)

            logger.info(f"Aave supply transaction sent: {tx_hash}")

            basescan_url = self.explorer.explorer_url("transaction", tx_hash)
            timestamp = datetime.utcnow()

            # Record escrow deposit in database
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type="escrow_deposit",
                from_wallet=wallet_address,
                to_wallet=self.aave_pool_address,
                amount=_decimal_to_decimal128(amount),
                currency="USDC",
                status="submitted",
                transaction_hash=tx_hash,
                basescan_url=basescan_url,
                created_at=timestamp,
            )

            await self.db.payments.insert_one(payment_doc.model_dump())

            return {
                "transaction_hash": tx_hash,
                "wallet_address": wallet_address,
                "amount": amount,
                "on_behalf_of": on_behalf_of,
                "status": "submitted",
                "timestamp": timestamp,
                "basescan_url": basescan_url,
            }

        except Exception as e:
            logger.error(f"Failed to supply to Aave: {e}")
            raise

    async def aave_withdraw(
        self,
        wallet_address: str,
        amount: Decimal,
        to: str
    ) -> dict:
        """
        Withdraw USDC from Aave protocol (escrow release).

        This is used to release funds from escrow after job completion.

        Args:
            wallet_address: Wallet withdrawing the USDC (must hold aTokens)
            amount: Amount of USDC to withdraw
            to: Address to receive the withdrawn USDC

        Returns:
            dict: Withdrawal transaction result containing:
                - transaction_hash: Blockchain transaction hash
                - wallet_address: Withdrawer wallet
                - amount: Withdrawn amount
                - to: Recipient address
                - status: Transaction status
                - timestamp: Transaction timestamp
                - basescan_url: Block explorer URL

        Raises:
            ValueError: If parameters are invalid
            Exception: If wallet has insufficient aTokens or withdrawal fails
        """
        logger.info(f"Withdrawing {amount} USDC from Aave to {to}")
        try:
            self.require_operation("aave_withdraw")
            # Validate addresses
            validate_address(wallet_address)
            validate_address(to)
            if amount <= 0:
                raise ValueError(f"Withdraw amount must be positive, got: {amount}")

            # Load wallet
            wallet_provider = await self._load_wallet(wallet_address)
            web3 = wallet_provider._web3

            amount_raw = int(amount * self.token_scale)

            # Execute Aave withdraw
            # Aave V3 Pool withdraw function ABI
            aave_withdraw_abi = [
                {
                    "inputs": [
                        {"internalType": "address", "name": "asset", "type": "address"},
                        {"internalType": "uint256", "name": "amount", "type": "uint256"},
                        {"internalType": "address", "name": "to", "type": "address"}
                    ],
                    "name": "withdraw",
                    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ]

            aave_pool = web3.eth.contract(
                address=Web3.to_checksum_address(self.aave_pool_address),
                abi=aave_withdraw_abi
            )

            withdraw_tx = aave_pool.functions.withdraw(
                Web3.to_checksum_address(self.usdc_address),
                amount_raw,
                Web3.to_checksum_address(to)
            ).build_transaction({
                "from": Web3.to_checksum_address(wallet_address),
                "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(wallet_address)),
            })

            tx_hash = wallet_provider.send_transaction(withdraw_tx)

            logger.info(f"Aave withdraw transaction sent: {tx_hash}")

            basescan_url = self.explorer.explorer_url("transaction", tx_hash)
            timestamp = datetime.utcnow()

            # Record escrow release in database
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type="escrow_release",
                from_wallet=self.aave_pool_address,
                to_wallet=to,
                amount=_decimal_to_decimal128(amount),
                currency="USDC",
                status="submitted",
                transaction_hash=tx_hash,
                basescan_url=basescan_url,
                created_at=timestamp,
            )

            await self.db.payments.insert_one(payment_doc.model_dump())

            return {
                "transaction_hash": tx_hash,
                "wallet_address": wallet_address,
                "amount": amount,
                "to": to,
                "status": "submitted",
                "timestamp": timestamp,
                "basescan_url": basescan_url,
            }

        except Exception as e:
            logger.error(f"Failed to withdraw from Aave: {e}")
            raise

    async def request_testnet_funds(self, wallet_address: str) -> dict:
        """
        Request testnet funds from faucet (development only).

        Args:
            wallet_address: Wallet to receive testnet funds

        Returns:
            dict: Faucet request result containing ETH and USDC hashes and explorer URLs.
                A token that the faucet rejects is omitted. Both failing raises.

        Raises:
            ValueError: If called on mainnet
            Exception: If both faucet requests fail
        """
        logger.info(f"Requesting testnet funds for {wallet_address}")
        try:
            self.require_operation("faucet_instructions")
            validate_address(wallet_address)
            await self._validate_stored_wallet(wallet_address)
            network = self.chain.provider_aliases.cdp
            if network is None:
                raise UnsupportedOperationError("CDP network mapping is unavailable")

            funded: dict[str, tuple[str, str]] = {}
            failures: list[str] = []
            last_error: Exception | None = None
            async with CdpClient(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                wallet_secret=self.wallet_secret,
            ) as cdp:
                for token in ("eth", "usdc"):
                    try:
                        transaction_hash = await cdp.evm.request_faucet(
                            address=wallet_address,
                            network=network,
                            token=token,
                        )
                        funded[token] = (
                            transaction_hash,
                            self.explorer.explorer_url("transaction", transaction_hash),
                        )
                    except Exception as token_error:
                        last_error = token_error
                        failures.append(token)
                        logger.warning(
                            "Faucet %s failed for %s: %s", token, wallet_address, token_error
                        )
            if not funded:
                raise last_error or RuntimeError("CDP faucet returned no transactions")

            eth = funded.get("eth")
            usdc = funded.get("usdc")
            timestamp = datetime.utcnow()
            if failures:
                message = (
                    "Testnet faucet partial: "
                    + ", ".join(f"{token} submitted" for token in funded)
                    + "; "
                    + ", ".join(f"{token} failed" for token in failures)
                )
                status_name = "partial"
            else:
                message = "Testnet ETH and USDC faucet transactions submitted"
                status_name = "submitted"
            return {
                "wallet_address": wallet_address,
                "eth_transaction_hash": eth[0] if eth else None,
                "eth_basescan_url": eth[1] if eth else None,
                "usdc_transaction_hash": usdc[0] if usdc else None,
                "usdc_basescan_url": usdc[1] if usdc else None,
                "status": status_name,
                "timestamp": timestamp,
                "message": message,
            }

        except Exception as e:
            logger.error(f"Failed to request testnet funds: {e}")
            raise

    async def _load_wallet(self, wallet_address: str) -> CdpEvmWalletProvider:
        """
        Load wallet from MongoDB by address.

        Args:
            wallet_address: The wallet's blockchain address

        Returns:
            CdpEvmWalletProvider: CDP wallet provider instance reconstructed from stored data

        Raises:
            ValueError: If wallet not found
            Exception: If wallet loading fails
        """
        logger.debug(f"Loading wallet {wallet_address}")
        try:
            await self._validate_stored_wallet(wallet_address)

            # Reconstruct CDP wallet provider using env wallet_secret
            config = CdpEvmWalletProviderConfig(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                wallet_secret=self.wallet_secret,
                network_id=self.network_id,
                address=wallet_address,
            )

            wallet_provider = await asyncio.get_event_loop().run_in_executor(
                None, lambda: CdpEvmWalletProvider(config)
            )

            logger.debug(f"Wallet {wallet_address} loaded successfully")
            return wallet_provider

        except Exception as e:
            logger.error(f"Failed to load wallet {wallet_address}: {e}")
            raise

    async def _load_platform_wallet(self) -> CdpEvmWalletProvider:
        """
        Load the platform's main wallet for fee collection and payouts.

        Returns:
            CdpEvmWalletProvider: CDP wallet provider instance for platform wallet

        Raises:
            ValueError: If platform wallet not found
            Exception: If wallet loading fails
        """
        logger.debug("Loading platform wallet")
        try:
            # Query for platform wallet
            # Note: The WalletDocument schema uses entity_type in ['user', 'agent', 'worker']
            # For platform wallet, we'll use entity_type='agent' with entity_id='platform'
            wallet_doc = await self.db.wallets.find_one({"entity_id": "platform"})

            if not wallet_doc:
                # Create platform wallet on first run
                logger.info("Platform wallet not found, creating new one...")
                wallet_info = await self.create_wallet(
                    entity_id="platform",
                    entity_type="agent"  # Use 'agent' type for platform
                )
                platform_address = wallet_info["wallet_address"]
                logger.info(f"Platform wallet created: {platform_address}")
            else:
                platform_address = wallet_doc["default_address"]

            # Load and return wallet provider
            return await self._load_wallet(platform_address)

        except Exception as e:
            logger.error(f"Failed to load platform wallet: {e}")
            raise
