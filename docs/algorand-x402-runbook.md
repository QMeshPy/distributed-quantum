# Algorand x402 TestNet Runbook

## What the platform needs

The platform is the seller. It needs one Algorand receiving address, not the
mnemonic or private key. Calling agents supply and retain their own payer keys.
The hosted GoPlausible facilitator requires no API key.

MetaMask is an EVM wallet and cannot sign Algorand AVM payments. Use Pera,
Defly, Lute, or the `@x402/avm` client signer for payer testing.

## Receiver preparation

1. Create a dedicated Algorand TestNet account in the operator's approved
   wallet/custody system. Back up its recovery material outside this repository.
2. Fund it with TestNet ALGO at <https://lora.algokit.io/testnet/fund>.
3. Opt the account into TestNet USDC ASA `10458941`. Algorand requires 0.1 ALGO
   base minimum balance plus 0.1 ALGO for this asset opt-in.
4. Optional: request TestNet USDC at <https://faucet.circle.com/>. The receiver
   can receive paid calls without holding USDC, but the opt-in is mandatory.
5. Set the public address as `X402_AVM_ADDRESS` in Vercel.

## Deployment configuration

Generate one shared secret:

```bash
openssl rand -hex 32
```

Set the value as `X402_GATEWAY_SECRET` in Vercel and
`QB2_X402_GATEWAY_SECRET` in the backend deployment. Then configure the other
variables from `frontend/.env.example`, deploy both sides, and set
`X402_ENABLED=true` only after the receiver has opted into USDC.

## Unpaid protocol check

An unsigned request must return HTTP 402 and must not create a backend job:

```bash
curl -i -X POST https://distributed-quantum.com/api/x402/quantum/runs \
  -H 'Content-Type: application/json' \
  --data '{"circuit":"OPENQASM 2.0; include \"qelib1.inc\"; qreg q[1]; h q[0];"}'
```

Decode the `PAYMENT-REQUIRED` header and confirm:

- network is Algorand TestNet;
- asset is USDC ASA `10458941`;
- `payTo` is the dedicated receiver;
- price matches `X402_QUANTUM_RUN_PRICE`;
- Bazaar discovery describes `POST /api/x402/quantum/runs` and its circuit
  input schema.

## Paid settlement check

Prepare a separate TestNet payer account with ALGO, opt it into TestNet USDC,
and fund it with Circle test USDC. Use the official `@x402/fetch` and
`@x402/avm` client flow from the Algorand tutorial. A successful request must:

1. return HTTP 201 with `job_id` and `status`;
2. include the `PAYMENT-RESPONSE` settlement header;
3. show the USDC transfer in Lora;
4. allow free polling at `/api/x402/quantum/runs/{job_id}`;
5. appear in facilitator/Bazaar discovery after settlement.

Do not commit payer keys, receiver recovery material, payment headers, or
shared gateway secrets. Delete ephemeral client wallets and test exports as
soon as the validation run is complete.

## MainNet switch

MainNet uses `X402_NETWORK=mainnet` and USDC ASA `31566704`. Before enabling it,
repeat receiver opt-in, custody, balance monitoring, incident recovery, pricing,
and accounting review with real funds. No code change is required.
