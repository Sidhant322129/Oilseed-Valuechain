---
description: Writes, tests, and deploys all 4 Solidity contracts to Sepolia testnet, connects them via Web3.js, integrates Pinata/IPFS and QR codes, and wires real blockchain data into the dashboards.
---

# Week 4: Blockchain — Solidity Smart Contracts + Remix IDE + Ethereum Sepolia Deployment

Trigger: /week4-blockchain

## Objective
Execute Week 4 of the 8-week plan: write, test, and deploy all four
Solidity smart contracts to the Ethereum Sepolia testnet, then wire
them into the existing Node.js backend via Web3.js so batch
registration, ownership transfer, and quality certificate hashes are
recorded on-chain and reflected on the dashboards.

## Context (already done — do not redo)
- Week 1: Supabase schema (14 tables), RLS, Auth, storage buckets
- Week 2: Express backend, JWT + role middleware, all base API routes
- Week 3: All 6 dashboards, wired to real data, no mock data
- Recent fixes: notification system consolidation, CRUD consistency
  across procurement bids, price alert engine (internal-only, no
  external integrations this week per current scope)
- blockchain/ folder already exists in the repo skeleton
  (contracts/, abis/, deployed_addresses.json placeholder)

## Steps to Execute

1. **Write and compile all four Solidity contracts (Solidity 0.8.x)
   in Remix IDE**, in this order — simplest first:
   - `FarmerRegistry.sol`: links a farmer's wallet address to their
     Supabase user ID (mapping + registration function + event).
   - `OwnershipTransfer.sol`: logs ownership transfer events when a
     batch changes hands (emits an event with batch ID, from, to,
     timestamp).
   - `QualityOracle.sol`: stores an IPFS certificate hash (CID)
     against a batch ID.
   - `BatchRecord.sol`: the batch lifecycle state machine —
     Registered → Certified → Dispatched → Received → Sold. Use an
     enum for status. Every transition function must use `require()`
     to enforce correct ordering (e.g. cannot go directly from
     Registered to Sold) and must include a descriptive revert
     message on failure, not a silent/generic revert.
   Pin the same `pragma solidity ^0.8.x` version consistently across
   all four files to avoid cross-contract compatibility issues.

2. **Test all contracts in Remix's JavaScript VM** (free, in-browser,
   no gas needed) before touching Sepolia:
   - Simulate farmer registration.
   - Simulate every valid batch status transition in order.
   - Simulate at least one INVALID transition attempt (e.g. skipping
     a stage) and confirm the contract correctly rejects it — do not
     consider testing complete until failure cases are verified, not
     just the happy path.
   - Simulate an ownership transfer and confirm the event fires.
   - Simulate an IPFS hash write to QualityOracle.
   - Debug and re-test until all of the above pass cleanly before
     moving to Sepolia.

3. **Deploy all four contracts to Sepolia testnet** from Remix using
   MetaMask (Injected Provider):
   - Confirm MetaMask is explicitly set to the Sepolia network before
     each deployment (not Mainnet, not another testnet).
   - Funded via free Sepolia ETH from a faucet — if gas/faucet issues
     arise, report them clearly rather than silently blocking.
   - Record each deployed contract's address in
     `blockchain/deployed_addresses.json`.

4. **Export each contract's ABI JSON from Remix** and save it into
   the Node.js project under `blockchain/abis/` (one file per
   contract, e.g. `FarmerRegistry.json`, `BatchRecord.json`,
   `OwnershipTransfer.json`, `QualityOracle.json`).

5. **Connect to the deployed contracts using Web3.js**:
   - Install and configure `web3` in the backend.
   - Use a real Sepolia RPC endpoint (Infura/Alchemy free tier) for
     the backend connection — not a local/VM-only provider, since
     that doesn't persist.
   - Implement backend service functions to call: farmer registration,
     batch status transitions, ownership transfer.
   - Implement event listeners for on-chain events (e.g. ownership
     transfer, batch status change) that update the corresponding
     Supabase records so the dashboards reflect on-chain state.
   - Handle the pending vs. confirmed vs. failed transaction states
     explicitly in both backend responses and frontend display — do
     not assume a transaction is instantly confirmed. Given this
     project's history of dashboard crashes from unhandled/undefined
     values, add explicit guards so a pending blockchain field never
     causes a frontend crash (e.g. no bare `.toFixed()` or similar on
     a value that may not exist yet).

6. **Integrate Pinata for IPFS pinning**:
   - Pin quality certificates and soil reports to IPFS via Pinata's
     API.
   - Save the returned CID into `QualityOracle.sol` via Web3.js.
   - Generate a QR code (using a package like `qrcode`) linking to
     each batch's provenance page.

7. **Verify all four contracts on Sepolia Etherscan** using Remix's
   Etherscan plugin — ensure the compiler version and optimization
   settings used for verification exactly match what was used for
   deployment.

8. **Wire blockchain state into the existing dashboards**:
   - Processor Dashboard's "Blockchain batch QR verification" —
     replace the current "Available once smart contracts are deployed
     (Week 4)" empty state with real QR scan + on-chain lookup.
   - Retailer Dashboard's "QR scan → blockchain provenance trail" —
     same replacement.
   - Admin Dashboard's "Smart contract address monitor" — replace
     the "No contracts deployed yet" empty state with the four real
     deployed addresses from `deployed_addresses.json`.
   - Do not remove or break any existing empty-state logic for
     features still correctly pending later weeks (e.g. AI
     predictions, payments) — only replace the states that were
     specifically gated on Week 4 blockchain deployment.

## Constraints
- Zero placeholders — every contract function must have full,
  working logic, not `// TODO` or stubbed returns.
- Do not fabricate contract addresses, transaction hashes, or CIDs —
  every value displayed must trace back to a real deployed contract
  or real Pinata upload.
- Do not modify frontend/backend logic unrelated to blockchain
  integration (auth, unrelated dashboard panels, notification system).
- If Sepolia faucet funds are unavailable or rate-limited, stop and
  report this clearly rather than attempting a workaround that fakes
  deployment.
- After generating, list every file created/modified so I can review
  before committing.

## Final Verification (report this back)
1. All four contracts compiled, tested in Remix VM (including at
   least one deliberate failure-case test), and deployed to Sepolia
   with addresses recorded.
2. ABI files present in `blockchain/abis/` for all four contracts.
3. Backend can successfully call at least one write function
   (e.g. register a farmer) and one read/event-listen function
   against the real deployed contracts — show the resulting
   transaction hash or Etherscan link as proof.
4. Contracts verified and viewable on Sepolia Etherscan.
5. Confirm Processor, Retailer, and Admin dashboards correctly
   display real on-chain data instead of the previous "pending Week
   4" empty states, with no crashes on pending/unconfirmed
   transaction states.
