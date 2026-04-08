# No-Fee Swap — Local Stack

This repository contains a **NoFeeSwap** Brownie project (`core`), an **operator** package, a **Next.js dApp** (`no-fee-swap-ui`), and an optional **sandwich / mempool bot** (`backend-script`) for local Anvil testing.

Everything below assumes **Windows, macOS, or Linux** with a shell where `python` and `node` are available.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `core/` | Nofeeswap core contracts, Brownie tests, deploy scripts, mock ERC20 deploy |
| `operator/` | Operator contract and Brownie deploy script |
| `no-fee-swap-ui/` | Next.js UI: wallet connect, pool init, liquidity, swap |
| `backend-script/` | TypeScript bot: mempool monitoring + sandwich simulation (Task 3) |
| `.vscode/settings.json` | Limits Git repo scanning (ignores nested `lib/` remotes) |

Deployment JSON files (addresses for Anvil) are written under:

- `core/deployments/anvil-core.json`, `core/deployments/anvil-tokens.json`
- `operator/deployments/anvil-operator.json`

---

## Step-by-step: clone → running

Follow these in order. (Deeper detail on Brownie, submodules, and troubleshooting appears in later sections.)

### 1. Clone the repo

```bash
git clone https://github.com/Goutamsahu23/no-fees-swap.git
cd no-fees-swap
```

Use your real remote URL if the account or repo name differs.

### 2. Install tools (once per machine)

| Tool | Notes |
|------|--------|
| **Node.js** (LTS) + **npm** | For `no-fee-swap-ui` and `backend-script` |
| **Python 3.10+** | For Brownie |
| **Brownie** | `pip install eth-brownie` inside a venv (recommended) |
| **Foundry** (`anvil`) | Local chain on `http://127.0.0.1:8545` |
| **MetaMask** | Browser wallet for the UI |

Install Foundry (for `anvil`) if it is not already installed:

**Windows (PowerShell):**

```powershell
irm https://foundry.paradigm.xyz | iex
foundryup
```

**macOS / Linux:**

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify:

```bash
node -v
npm -v
python --version
brownie --version
anvil --version
```

### 3. Python venv + Brownie (contracts)

**Windows (cmd / PowerShell):**

```bat
cd path\to\no-fees-swap
python -m venv .venv
.venv\Scripts\activate
pip install eth-brownie
```

**macOS / Linux:**

```bash
cd /path/to/no-fees-swap
python3 -m venv .venv
source .venv/bin/activate
pip install eth-brownie
```

If `core/requirements.txt` exists in your tree:

```bash
cd core
pip install -r requirements.txt
cd ..
```

### 4. Compile contracts

```bash
cd core
brownie compile
cd ../operator
brownie compile
cd ..
```

### 5. Install JavaScript dependencies

```bash
cd no-fee-swap-ui
npm install
cd ../backend-script
npm install
cd ..
```

### 6. Start Anvil (keep this terminal open)

```bash
anvil --base-fee 0
```

- **RPC:** `http://127.0.0.1:8545`
- **Chain id:** `31337`

Plain `anvil` also works.

### 7. Deploy contracts (new terminal, venv active)

Run again **every time you restart Anvil** (chain state resets).

**Windows:**

```bat
cd path\to\no-fees-swap\core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ..\operator
brownie run deploy_operator --network anvil
cd ..
```

**macOS / Linux:**

```bash
cd /path/to/no-fees-swap/core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ../operator
brownie run deploy_operator --network anvil
cd ..
```

This writes `core/deployments/anvil-core.json`, `anvil-tokens.json`, and `operator/deployments/anvil-operator.json`.

### 8. Configure env files (recommended: generators)

**UI — `no-fee-swap-ui/.env.local`**

Reads the same deployment JSONs and fills all `NEXT_PUBLIC_*` variables:

```bash
cd no-fee-swap-ui
npm run env:print
npm run env:write
```

- `env:print` — print lines to the terminal  
- `env:write` — write **`no-fee-swap-ui/.env.local`** (gitignored)

Manual fallback: `copy .env.example .env.local` (Windows) or `cp .env.example .env.local` (macOS/Linux), then paste addresses from the JSON files.

**Sandwich bot (optional) — `backend-script/.env`**

```bash
cd ../backend-script
npm run env:print
npm run env:write
```

- Default **`ATTACKER_PRIVATE_KEY`** is Anvil account **#1**; override when generating:  
  `set ATTACKER_PRIVATE_KEY=0x...` then `npm run env:write` (Windows), or  
  `ATTACKER_PRIVATE_KEY=0x... npm run env:write` (Unix).

### 9. MetaMask

- Add network **31337**, RPC **`http://127.0.0.1:8545`**
- Import or use an **Anvil** account (keys are printed when `anvil` starts)

### 10. Run the UI

```bash
cd no-fee-swap-ui
npm run dev
```

Open **http://localhost:3000** → **Connect** → in order:

1. Initialize pool  
2. Approve token0 and token1  
3. Mint liquidity  
4. Swap  

### 11. (Optional) Sandwich bot — mempool testing

With Anvil still running:

```bash
cd backend-script
npm run setup
npm run dev
```

Then submit a **swap from the UI**. After `setup`, **auto-mine is off** so txs stay pending long enough for the bot to see them.

---

## Using Anvil account **#1** instead of the default **#0**

By default, Brownie deploy scripts use **Anvil account #0** (`DEPLOYER_PRIVATE_KEY` unset). To deploy with **account #1**, set the env var to that account’s private key (printed when you start `anvil`).

**Windows (cmd):**

```bat
set DEPLOYER_PRIVATE_KEY=0xYOUR_ANVIL_ACCOUNT_1_PRIVATE_KEY
cd path\to\no-fees-swap\core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ..\operator
brownie run deploy_operator --network anvil
cd ..
```

**PowerShell:**

```powershell
$env:DEPLOYER_PRIVATE_KEY="0xYOUR_ANVIL_ACCOUNT_1_PRIVATE_KEY"
cd path\to\no-fees-swap\core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ..\operator
brownie run deploy_operator --network anvil
cd ..
```

**macOS / Linux:**

```bash
export DEPLOYER_PRIVATE_KEY=0xYOUR_ANVIL_ACCOUNT_1_PRIVATE_KEY
cd /path/to/no-fees-swap/core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ../operator
brownie run deploy_operator --network anvil
cd ..
```

**UI (MetaMask):** Import **account #1**’s private key and connect with that account so **Initialize pool** / swaps use the same wallet you intend (pool id is tied to the initializer address).

**Sandwich bot:** The generated `backend-script/.env` already defaults **`ATTACKER_PRIVATE_KEY`** to Anvil **#1**. If you changed it, set `ATTACKER_PRIVATE_KEY` before `npm run env:write`, or edit `.env` by hand.

**After switching deployer:** Contract addresses may change. Regenerate env files:

```bash
cd no-fee-swap-ui
npm run env:write
cd ../backend-script
npm run env:write
```

