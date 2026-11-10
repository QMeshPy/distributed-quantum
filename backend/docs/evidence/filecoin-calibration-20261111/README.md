# Live Filecoin Calibration evidence

Implementation: [PR #145](https://github.com/QMeshPy/distributed-quantum/pull/145), [issue #144](https://github.com/QMeshPy/distributed-quantum/issues/144).

Five public objects were confirmed in dataset **52518**, provider **9**, using faucet test FIL and test USDFC. No custom contract was deployed. Every object was downloaded in a fresh, key-free verification process and checked against its PieceCID, SHA256 and byte length; package/dataset/checkpoint schemas were also validated.

| Object | Bytes | Piece ID | Evidence |
| --- | ---: | ---: | --- |
| Bell experiment + NEAR provenance | 7,292 | 0 | [Transaction](https://beryx.io/fil/calibration/txs/0xece0512aca548d03f5222406c305e389aa9ac565a5f741f3bdf36810e87ad8b2) / [receipt](bell-receipt.json) |
| Synthetic finance CSV | 847 | 1 | [Transaction](https://beryx.io/fil/calibration/txs/0xe895434a95b4ca30c653278236016c5a1358f17f9507dbc599a5c186dda2529f) / [receipt](finance-dataset-receipt.json) |
| NCN toy Hamiltonian dataset | 1,106 | 2 | [Transaction](https://beryx.io/fil/calibration/txs/0x77e79da32215090106677d56d85dd5590eefbc84faf2552637d4189ef15404a3) / [receipt](pharma-dataset-receipt.json) |
| Completed VQE task checkpoint | 448 | 3 | [Transaction](https://beryx.io/fil/calibration/txs/0xeec3df365fb20c6f6d4bfabd89df94e379e85502dfb50a6c25b2d325338abc8f) / [receipt](pharma-checkpoint-receipt.json) |
| Finance result, input CSV and circuit archive | 20,499 | 4 | [Transaction](https://beryx.io/fil/calibration/txs/0xedc6401aa5aa80085aafb3298baddbb3c504da45f4fe233bf3132efb44859449) / [receipt](finance-package-receipt.json) |

[Machine-readable observations](retrieval-and-status.json) record live registration for all five pieces. **PDP was pending for the current period** at these observations; successful retrieval is independently verified and is not presented as a completed PDP proof. This demonstration used one provider, not replicated storage.

## What ran

- **Bell archive:** the downloaded package's input, result, execution plan and bundle commitments passed verification, as did both existing NEAR testnet anchors. See [verification report](bell-near-verification.json).
- **Pharma:** the actual local VQE handler consumed the Filecoin-hosted NCN/STO-3G toy Hamiltonian (four qubits, two active electrons). It completed 35 evaluations at **-148.33704862401328 Ha** and published a completed-task checkpoint. A separate process retrieved the dataset and checkpoint, restored the identical outcome hash, and made **zero compute calls and zero uploads**. This reused an earlier Hamiltonian; it was not a new molecule-generation or safety-validation experiment.
- **Finance:** the real portfolio builder consumed the Filecoin-hosted **synthetic** CSV (13 rows, four assets). It selected SYN_A and SYN_B with objective **0.554655045676**, matching exact enumeration across six feasible portfolios. Its inputs, result and QASM circuit were archived together. These are local CPU demonstrations, not live mesh or market-performance measurements.

[Summary and result hashes](summary.json) distinguish execution, storage and provenance evidence.

## Independently retrieve

Install the backend and `npm ci --ignore-scripts --prefix services/filecoin`, then run from the repository root (no wallet key required):

```sh
python backend/scripts/filecoin.py download backend/docs/evidence/filecoin-calibration-20261111/finance-package-receipt.json finance-package.json
python backend/scripts/filecoin.py status backend/docs/evidence/filecoin-calibration-20261111/pharma-checkpoint-receipt.json
```

For the Bell archive's independent NEAR check, set `QB2_NEAR_REGISTRY_CONTRACT` and `QB2_NEAR_REGISTRY_PUBLISHER` to `qmesh-provenance-20261110.testnet`, then run `filecoin.py verify` with `bell-receipt.json`. Status is a fresh observation and can change as funding and provider health change.

## Funding and operational boundaries

The active demo wallet is `0xA63A33e52589c761F90ce46F7c86aeEe8644112f`. Its [one-test-USDFC deposit](https://beryx.io/fil/calibration/txs/0xbee3642018b40a0fdbd4708d6e3a4f26835123a5a0e05916ff94079235986e9a) and [finite operator approval](https://beryx.io/fil/calibration/txs/0xde85d6ed9a228071593c37a3fb8caf2c4a1ec8bed2fbf26bcab8a560077acc4e) used existing faucet funds. Approval limits were 0.25 test USDFC/month, one test USDFC lockup and the contract-required 30-day lockup period. A seven-day runway target does not schedule deletion. Earlier uncertain setup activity was quarantined by revoking the old wallet's operator approval; it is excluded from successful-object counts.

The production UI built successfully and its interactions were exercised with an explicitly isolated account/API fixture. The real email-OTP session could not be tested because the available computer-use runtime failed to initialize. Hosted use still requires operator configuration of MongoDB, authentication and a funded agent key as documented in [setup](../../filecoin-calibration.md).
