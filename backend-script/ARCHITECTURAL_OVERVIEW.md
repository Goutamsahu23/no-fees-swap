# Task 3 — Mempool Bot Architectural Overview

## 1) High-level design

The sandwich bot is organized into small modules, each with a single responsibility:

- `backend-script/src/index.ts`  
  Main loop that orchestrates monitoring, decoding, and execution.
- `backend-script/src/monitor.ts`  
  Watches Anvil mempool (`txpool_content`) and emits pending swap candidates.
- `backend-script/src/decoder.ts`  
  Decodes `unlock(address, bytes)` calldata and parses the inner operator bytecode.
- `backend-script/src/sequences.ts`  
  Rebuilds operator-compatible payloads for attacker front-run/back-run swaps.
- `backend-script/src/sandwich.ts`  
  Applies attack strategy, submits ordered transactions, mines block, and reports result.

This separation keeps the flow easy to test and reason about: detect -> decode -> decide -> execute.

---

## 2) Mempool detection and decoding logic

### Detection

1. Poll Anvil mempool through `txpool_content`.
2. Filter pending transactions whose `to` equals configured `NOFEESWAP`.
3. Ignore already-seen hashes to avoid duplicate processing.

### Decoding

1. ABI-decode outer call and keep only `unlock(address, bytes)`.
2. Parse inner packed bytes action-by-action.
3. Locate `PUSH32` (captures `amountSpecified`) followed by `SWAP`.
4. From `SWAP`, extract:
   - `poolId`
   - `limitOffsetted` (slippage boundary encoding)
   - `zeroForOne` (direction)
5. Recover additional fields (e.g. log-offset-based limit interpretation) and estimate slippage bps.
6. Extract victim/payer address from `TAKE_TOKEN` path when available.

This gives exact victim trade size and the encoded slippage limit before the victim transaction is mined.

---

## 3) Sandwich execution strategy

When a target is detected, the bot prepares three ordered transactions:

1. **Front-run (buy leg / same direction as victim)**  
   Sent with higher gas pricing than victim so it is mined first.
2. **Victim swap**  
   Already pending in mempool, now executes after front-run at a worse effective price.
3. **Back-run (sell leg / opposite direction)**  
   Sent with lower gas pricing than victim so it lands after victim.

On local Anvil with auto-mining disabled, the bot can place both attacker legs around the victim, then mine a block.

---

## 4) Profitability math used in this implementation

Current implementation uses a practical local-simulation metric:

- Snapshot attacker balances before execution (`token0`, `token1`).
- Execute front-run + back-run around victim.
- Snapshot balances after execution.
- Compute:
  - `delta0 = token0_after - token0_before`
  - `delta1 = token1_after - token1_before`
- Report combined raw result as a simplified net outcome indicator.

This is sufficient for assignment/demo visibility in a local environment.


---



