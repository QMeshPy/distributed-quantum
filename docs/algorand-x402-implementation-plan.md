# Algorand x402 Implementation Plan

> Execute test-first on `feat/algorand-x402`.

## 1. Backend internal boundary

- Extend `backend/tests/unit/test_config_loader.py` with the gateway secret
  expectation and run it red.
- Add `QB2_X402_GATEWAY_SECRET` to `AppSettings` and run the test green.
- Add one focused router test covering absent route, rejected secret, paid-owner
  submission, and paid-owner job lookup; run it red.
- Add internal submit/status routes to the existing circuits router, reusing
  `CircuitJobService` and response models; run the focused tests green.

## 2. Next.js AVM resource server

- Read the relevant local Next.js route-handler and environment documentation.
- Add a small Node test for x402 environment validation/network selection and
  run it red.
- Add the current official x402 AVM/Next/Bazaar packages.
- Implement a server-only x402 feature that validates configuration, creates an
  explicit `x402HTTPResourceServer`, forwards paid submission to FastAPI, and
  forwards free status polling.
- Add thin App Router files and make `/api/x402` public in `proxy.ts`.
- Run the focused test, TypeScript check, changed-file lint, and production build.

## 3. Deployment and operator workflow

- Document all frontend/backend variables in the example environment files and
  pass the backend secret through Docker Compose.
- Add an operator runbook covering TestNet receiver creation, ALGO funding,
  USDC opt-in/funding, an unpaid 402 check, a paid client check, and the MainNet
  switch.

## 4. Verification

- Run backend focused tests and lint/type checks on changed Python files.
- Start the backend and frontend locally with an ephemeral test configuration.
- Verify health, disabled/misconfigured behavior, internal-secret rejection, and
  the public 402 response from the terminal and Chrome.
- Decode the payment requirement and verify network, asset, receiver, price,
  discovery metadata, and route template.
- If a funded TestNet payer is available, run one real settlement and confirm
  the transaction in Lora; otherwise record that external funding remains the
  only unexecuted step.
