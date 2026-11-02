"""Registry tests are offline and require neither wallets nor a database."""

from __future__ import annotations

import traceback
from importlib.resources import files

import pytest
from pydantic import ValidationError

from quantum_backend_v2.chains.loader import RegistryConfigurationError, load_chain_registry
from quantum_backend_v2.chains.models import (
    ChainRegistry,
    DisabledNetworkError,
    UnknownNetworkError,
)
from quantum_backend_v2.config import load_settings


@pytest.fixture
def data():
    return load_chain_registry().model_dump()


def test_packaged_registry_and_provider_mappings():
    registry = load_chain_registry()
    assert registry.default_chain_id == "eip155:84532"
    assert registry.resolve().chain_id == "eip155:84532"
    wallet_caps = {
        "explorer_url",
        "create_wallet",
        "get_balance",
        "transfer_stablecoin",
        "verify_transaction",
        "aave_supply",
        "aave_withdraw",
        "faucet_instructions",
    }
    for chain_id, alias, address in (
        ("eip155:84532", "base-sepolia", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
        (
            "eip155:421614",
            "arbitrum-sepolia",
            "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        ),
        ("eip155:11155111", "ethereum-sepolia", "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
    ):
        chain = registry.resolve(chain_id)
        assert registry.resolve(alias) is chain
        assert chain.provider_aliases.agentkit == alias
        assert chain.provider_aliases.cdp == alias
        assert chain.native_token.symbol == "ETH"
        assert chain.native_token.decimals == 18
        assert chain.stablecoin.symbol == "USDC"
        assert chain.stablecoin.decimals == 6
        assert chain.stablecoin.address == address
        assert chain.testnet and chain.enabled
        if alias in {"base-sepolia", "arbitrum-sepolia"}:
            assert set(chain.capabilities) == wallet_caps
            assert chain.aave_pool_address is not None
        elif alias == "ethereum-sepolia":
            assert chain.capabilities == (
                "explorer_url",
                "verify_transaction",
                "get_price",
                "anchor_root",
            )
        else:
            assert chain.capabilities == ("explorer_url", "verify_transaction")


@pytest.mark.parametrize("network", ["", "BASE-SEPOLIA", "84532", "eip155:084532", "typo"])
def test_unknown_networks_never_fall_back(network):
    with pytest.raises(UnknownNetworkError, match="unknown network"):
        load_chain_registry().resolve(network)


@pytest.mark.parametrize("network", ["eip155:11155111", "ethereum-sepolia"])
def test_disabled_networks_are_rejected(data, network):
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth["enabled"] = False
    registry = ChainRegistry.model_validate(data)
    with pytest.raises(DisabledNetworkError, match="disabled"):
        registry.resolve(network)


@pytest.mark.parametrize("field", ["chain_id", "aliases", "provider_aliases"])
def test_duplicate_identifiers_across_entries_are_rejected(data, field):
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth[field] = data["chains"][0][field]
    with pytest.raises(ValidationError, match="duplicate"):
        ChainRegistry.model_validate(data)


def test_alias_cannot_shadow_another_provider_mapping(data):
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth["provider_aliases"]["cdp"] = "base-sepolia"
    with pytest.raises(ValidationError, match="duplicate"):
        ChainRegistry.model_validate(data)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("chain_id", "eip155:084532"),
        ("chain_id", "eip155:0"),
        ("chain_id", "eip155:-1"),
        ("chain_id", "eip155:1.5"),
        ("chain_id", "eip155:" + "1" * 33),
        ("chain_id", "solana:devnet"),
        ("family", "svm"),
        ("display_name", " "),
        ("testnet", "false"),
        ("enabled", 1),
        ("aliases", ["base-sepolia", "base-sepolia"]),
        ("aliases", ["eip155:1"]),
        ("rpc_env_var", "https://rpc.example/SECRET"),
        ("rpc_env_var", ""),
        ("rpc_url", "https://rpc.example/SECRET"),
        ("public_rpc_url", "http://sepolia.base.org"),
        ("public_rpc_url", "https://user:pass@rpc.example"),
        ("public_rpc_url", "https://rpc.example/v1?key=SECRET"),
        ("public_rpc_url", "https://rpc.example/#SECRET"),
        ("capabilities", ["transfer_stablecoin"]),
        ("capabilities", ["get_balance"]),
        ("capabilities", ["sign_transaction"]),
        ("capabilities", ["explorer_url", "explorer_url"]),
    ],
)
def test_invalid_chain_configuration(data, field, value):
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth[field] = value
    with pytest.raises(ValidationError):
        ChainRegistry.model_validate(data)


@pytest.mark.parametrize("decimals", [-1, 256, "6", True])
def test_invalid_token_decimals(data, decimals):
    data["chains"][0]["stablecoin"]["decimals"] = decimals
    with pytest.raises(ValidationError):
        ChainRegistry.model_validate(data)


def test_invalid_token_address(data):
    data["chains"][0]["stablecoin"]["address"] = "0x1234"
    with pytest.raises(ValidationError):
        ChainRegistry.model_validate(data)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/tx/{tx_hash}",
        "https://user:SECRET@example.com/tx/{tx_hash}",
        "https://example.com/tx/{tx_hash}?api_key=SECRET",
        "https://example.com/tx/{tx_hash}#SECRET",
        "https://example.com/tx/{other}",
        "https://example.com/tx/{tx_hash.__class__}",
        "https://example.com/tx/{tx_hash}/{tx_hash}",
        "https://example.com/tx/static",
    ],
)
def test_unsafe_or_invalid_public_explorer_templates(data, url):
    data["chains"][0]["explorers"]["transaction"] = url
    with pytest.raises(ValidationError, match="invalid public explorer template"):
        ChainRegistry.model_validate(data)


def test_mainnet_must_stay_disabled(data):
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth["chain_id"] = "eip155:1"
    eth["testnet"] = False
    with pytest.raises(ValidationError, match="mainnet"):
        ChainRegistry.model_validate(data)
    eth["enabled"] = False
    # Provenance anchoring is testnet-only, even on a disabled mainnet entry.
    with pytest.raises(ValidationError, match="limited to testnets"):
        ChainRegistry.model_validate(data)
    eth["capabilities"] = ("explorer_url", "verify_transaction", "get_price")
    registry = ChainRegistry.model_validate(data)
    with pytest.raises(DisabledNetworkError):
        registry.resolve("eip155:1")


@pytest.mark.parametrize("default", ["eip155:1", "base-sepolia"])
def test_default_must_be_a_known_canonical_id(data, default):
    data["default_chain_id"] = default
    with pytest.raises(ValidationError):
        ChainRegistry.model_validate(data)


def test_default_cannot_be_disabled(data):
    data["chains"][0]["enabled"] = False
    with pytest.raises(ValidationError, match="default chain"):
        ChainRegistry.model_validate(data)


def test_registry_and_nested_metadata_are_immutable():
    registry = load_chain_registry()
    with pytest.raises(ValidationError, match="frozen"):
        registry.default_chain_id = "eip155:11155111"
    with pytest.raises(ValidationError, match="frozen"):
        registry.resolve().native_token.decimals = 5
    with pytest.raises(ValidationError, match="frozen"):
        registry.resolve().provider_aliases.agentkit = "another-network"


def test_explicit_registry_path_is_independent_of_working_directory(tmp_path, monkeypatch):
    path = tmp_path / "custom.toml"
    source = files("quantum_backend_v2.chains").joinpath("registry.toml").read_text()
    path.write_text(
        source.replace('default_chain_id = "eip155:84532"', 'default_chain_id = "eip155:11155111"')
    )
    settings = load_settings(env={"QB2_CHAIN_REGISTRY_PATH": str(path)})
    monkeypatch.chdir(tmp_path)
    assert load_chain_registry(settings.chain_registry_path).resolve().chain_id == "eip155:11155111"
    assert load_chain_registry().resolve().chain_id == "eip155:84532"


@pytest.mark.parametrize("contents", ['rpc_url = "TOP_SECRET"', "TOP_SECRET = ["])
def test_loader_errors_do_not_echo_inputs_or_parser_details(tmp_path, contents):
    path = tmp_path / "TOP_SECRET.toml"
    path.write_text(contents)
    with pytest.raises(RegistryConfigurationError) as error:
        load_chain_registry(path)
    assert "TOP_SECRET" not in "".join(traceback.format_exception(error.value))


@pytest.mark.parametrize(
    "old,new,reason",
    [
        ("ethereum-sepolia", "base-sepolia", "duplicate chain identifier or network alias"),
        (
            'default_chain_id = "eip155:84532"',
            'default_chain_id = "eip155:1"',
            "default chain must identify an enabled registry entry",
        ),
    ],
)
def test_loader_explains_invalid_configuration(tmp_path, old, new, reason):
    path = tmp_path / "chains.toml"
    source = files("quantum_backend_v2.chains").joinpath("registry.toml").read_text()
    path.write_text(source.replace(old, new))
    with pytest.raises(RegistryConfigurationError, match=reason):
        load_chain_registry(path)


def test_loader_redacts_nested_unknown_keys_and_values(tmp_path):
    path = tmp_path / "chains.toml"
    source = files("quantum_backend_v2.chains").joinpath("registry.toml").read_text()
    path.write_text(source + '\nTOP_SECRET_KEY = "TOP_SECRET_VALUE"\n')
    with pytest.raises(RegistryConfigurationError, match="Extra inputs are not permitted") as error:
        load_chain_registry(path)
    assert "TOP_SECRET" not in "".join(traceback.format_exception(error.value))


def test_missing_registry_is_an_error_without_echoing_path(tmp_path):
    with pytest.raises(RegistryConfigurationError) as error:
        load_chain_registry(tmp_path / "TOP_SECRET.toml")
    assert "TOP_SECRET" not in str(error.value)


def test_no_rpc_credentials_are_read(monkeypatch, caplog):
    monkeypatch.setenv("QB2_BASE_SEPOLIA_RPC_URL", "https://user:TOP_SECRET@rpc.example")
    registry = load_chain_registry()
    assert "TOP_SECRET" not in registry.model_dump_json()
    assert "TOP_SECRET" not in repr(registry)
    assert "TOP_SECRET" not in caplog.text


@pytest.mark.parametrize(
    "field,value",
    [
        ("stablecoin", None),
        ("aave_pool_address", None),
        ("aave_pool_address", "not-an-address"),
        ("provider_aliases", {"agentkit": "ethereum-sepolia", "cdp": "ethereum-sepolia"}),
        ("capabilities", ["transfer_stablecoin", "explorer_url"]),
        ("capabilities", ["aave_withdraw"]),
    ],
)
def test_wallet_capabilities_require_complete_metadata(data, field, value):
    data["chains"][0][field] = value
    with pytest.raises(ValidationError):
        ChainRegistry.model_validate(data)
