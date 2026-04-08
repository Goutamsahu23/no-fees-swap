# Sandwich Attack Bot — NoFeeSwap Local Testnet

Monitors the Anvil mempool for pending NoFeeSwap swap transactions, decodes their calldata to extract the victim's slippage tolerance and trade size, and executes a sandwich attack (front-run → victim → back-run) with gas-price ordering.

## Prerequisites

- **Anvil** running on `http://127.0.0.1:8545`
- Core + Operator contracts deployed (Brownie scripts in `../core/` and `../operator/`)
- Mock ERC20 tokens deployed (`../core/scripts/deploy_tokens.py`)
- A pool initialized via the UI

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Generate .env from deployment JSONs (same sources as the UI)
npm run env:print
npm run env:write

# Optional: use a custom attacker key when generating (Unix)
# ATTACKER_PRIVATE_KEY=0x... npm run env:write

# 3. Run the one-time setup (disables auto-mine, funds attacker with tokens)
npm run setup

# 4. Start the bot
npm run dev

# 5. Open the UI (http://localhost:3000), connect MetaMask, and submit a swap.
#    The bot will detect it in the mempool and execute a sandwich.
```

Manual alternative: copy **`.env.example`** to **`.env`** and fill addresses from `../core/deployments/` and `../operator/deployments/`.

## How It Works

### 3a — Mempool Monitoring

The bot polls Anvil's `txpool_content` JSON-RPC method every 200ms for pending transactions targeting the Nofeeswap contract address.

**Important:** Auto-mining must be disabled (`evm_setAutomine(false)`) so transactions remain in the pending pool long enough for the bot to detect them. The `setup` script does this automatically.

### 3b — Target Detection & Calldata Decoding

When a pending `unlock(address, bytes)` transaction is found:

1. The ABI-encoded outer call is decoded to extract the operator address and inner data blob.
2. The inner data is the operator's packed bytecode sequence. The decoder walks through opcodes looking for `PUSH32` (opcode 3) followed by `SWAP` (opcode 52).
3. From the SWAP opcode fields it extracts:
   - **poolId** (256-bit)
   - **amountSpecified** (the victim's trade size, from the preceding PUSH32)
   - **limitOffsetted** (64-bit log-price limit — encodes slippage tolerance)
   - **zeroForOne** (trade direction)
4. The log-price limit is converted back to estimate the victim's slippage in basis points.

### 3c — Sandwich Execution

If the decoded parameters indicate a viable target:

1. **Front-run** — A swap in the same direction as the victim, with a gas price **+2 gwei above** the victim's, so miners order it first. Uses the most aggressive limit (push price maximally).
2. **Victim swap** — Executes at a worse price because the front-run moved the market.
3. **Back-run** — A swap in the opposite direction (selling what the front-run bought), with a gas price **-1 wei below** the victim's, so it's mined right after. Captures the spread as profit.
4. All three transactions are in the mempool; `evm_mine` is called to produce a block with the desired ordering.

## Project Structure

```
src/
  index.ts      — Main loop: connect, poll, sandwich
  config.ts     — Env-var loading
  abis.ts       — Contract ABIs (Nofeeswap, ERC20)
  decoder.ts    — Calldata decoder for unlock→SWAP opcodes
  sequences.ts  — Builds operator swap bytecodes for attacker txs
  monitor.ts    — Mempool watcher (txpool_content polling)
  sandwich.ts   — Sandwich executor (front-run + back-run)
  setup.ts      — One-time: disable auto-mine, fund attacker, approve
```

## Environment Variables

Generate from deployment JSONs (recommended):

```bash
npm run env:print
npm run env:write
```

| Variable | Description |
|---|---|
| `RPC_URL` | Anvil HTTP endpoint |
| `NOFEESWAP` | Nofeeswap core contract |
| `NOFEESWAP_DELEGATEE` | Delegatee (from `anvil-core.json`; informational in `.env`) |
| `OPERATOR` | Operator (unlock target) |
| `TOKEN0` / `TOKEN1` | Sorted mock ERC20 addresses |
| `ATTACKER_PRIVATE_KEY` | Bot signer — default Anvil **#1** in generated `.env`; override when running `env:write` |
| `MIN_PROFIT_WEI` | Skip sandwiches below this threshold |
| `POLL_INTERVAL_MS` | Mempool poll frequency |
