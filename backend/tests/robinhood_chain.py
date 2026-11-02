"""Real Robinhood Chain Chainlink rounds served through an in-process JSON-RPC provider.

Serves fixtures/robinhood_chainlink_rounds.json through the same Multicall3 calldata the
history reader sends, so encoding, decoding and validation all run offline.
"""

import copy
import json
from datetime import date
from pathlib import Path

from eth_abi import decode, encode
from web3 import Web3
from web3.providers import BaseProvider

from quantum_backend_v2.chains.market_data import load_market_data
from quantum_backend_v2.chains.price_history import TokenPriceHistoryReader

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "robinhood_chainlink_rounds.json").read_text()
)
BLOCK = FIXTURE["block"]
SOURCE = load_market_data()
ROUND_TYPES = ["uint80", "int256", "uint256", "uint256", "uint80"]
DESCRIPTION, DECIMALS, LATEST, GET_ROUND, TRY_AGGREGATE = (
    bytes.fromhex(selector)
    for selector in ("7284e416", "313ce567", "feaf968c", "9a6fc8f5", "bce38bd7")
)
FULL_RANGE = (date(2026, 6, 1), date(2026, 10, 28))


class RecordedChain(BaseProvider):
    """Serves recorded rounds; asserts every read is a pinned Multicall3 eth_call."""

    def __init__(self):
        super().__init__()
        self.feeds = copy.deepcopy(FIXTURE["feeds"])
        self.methods = []
        self.batches = []
        self.chain_id = 4663
        self.timestamp = BLOCK["timestamp"]
        self.reorg = False
        self.error = None

    def rounds(self, symbol):
        return next(feed for feed in self.feeds.values() if feed["symbol"] == symbol)["rounds"]

    def make_request(self, method, params):
        self.methods.append(method)
        if self.error is not None:
            raise self.error
        if method == "eth_chainId":
            result = hex(self.chain_id)
        elif method == "eth_getBlockByNumber":
            moved = self.reorg and params[0] != "latest"
            result = {
                "number": hex(BLOCK["number"]),
                "hash": "0x" + "cd" * 32 if moved else BLOCK["hash"],
                "timestamp": hex(self.timestamp),
            }
        elif method == "eth_call":
            call, block = params
            assert call["to"].lower() == SOURCE.multicall_address.lower()
            assert block == hex(BLOCK["number"])
            data = bytes.fromhex(call["data"][2:])
            assert data[:4] == TRY_AGGREGATE
            _, calls = decode(["bool", "(address,bytes)[]"], data[4:])
            self.batches.append(len(calls))
            answers = [self._answer(target, payload) for target, payload in calls]
            result = "0x" + encode(["(bool,bytes)[]"], [answers]).hex()
        else:
            raise AssertionError(f"unexpected RPC method {method}")
        return {"jsonrpc": "2.0", "id": 1, "result": result}

    def _answer(self, target, payload):
        feed = self.feeds.get(Web3.to_checksum_address(target))
        if feed is None:
            return (False, b"")
        selector, arguments = payload[:4], payload[4:]
        if selector == DESCRIPTION:
            return (True, encode(["string"], [feed["description"]]))
        if selector == DECIMALS:
            return (True, encode(["uint8"], [feed["decimals"]]))
        phase, rounds = feed["phase_id"], feed["rounds"]
        if selector == LATEST:
            recorded = rounds[-1]
        elif selector == GET_ROUND:
            (round_id,) = decode(["uint80"], arguments)
            index = (round_id & ((1 << 64) - 1)) - 1
            if round_id >> 64 != phase or not 0 <= index < len(rounds):
                return (False, b"")
            recorded = rounds[index]
        else:
            raise AssertionError("unexpected feed call")
        aggregator_round, answer, started, updated, answered = recorded
        return (
            True,
            encode(
                ROUND_TYPES,
                [
                    (phase << 64) | aggregator_round,
                    int(answer),
                    started,
                    updated,
                    (phase << 64) | answered,
                ],
            ),
        )


def read(provider, symbols=("SPY", "QQQ"), dates=FULL_RANGE):
    return TokenPriceHistoryReader(SOURCE, Web3(provider)).read(list(symbols), *dates)
