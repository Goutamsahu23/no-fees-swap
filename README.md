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

## Get the code — NoFeeSwap `core` and `operator`

The Brownie packages come from the **NoFeeSwap** organization on GitHub. If you do **not** already have them, clone both repositories **next to each other** (folder names must be `core` and `operator` so the paths in this README match):

```bash
mkdir no-fee-swap-workspace && cd no-fee-swap-workspace
git clone https://github.com/NoFeeSwap/core.git core
git clone https://github.com/NoFeeSwap/operator.git operator
```

Official repositories:

- [https://github.com/NoFeeSwap/core](https://github.com/NoFeeSwap/core) — NoFeeSwap core contracts  
- [https://github.com/NoFeeSwap/operator](https://github.com/NoFeeSwap/operator) — NoFeeSwap operator  

### Task 3 — Sandwich bot (`backend-script`)

The TypeScript mempool / sandwich bot lives in **`backend-script/`**. It runs **alongside** the UI and talks to the same Anvil node. After `core` and `operator` are deployed locally, configure `backend-script/.env` with the same contract addresses as the UI, run `npm run setup` (disables auto-mining), then `npm run dev`. See **`backend-script/README.md`** for details.

---

## Contracts: Brownie, not Hardhat (Phase 5 / coursework notes)

Some instructions mention **`npx hardhat compile`** under `core/` and `operator/`. **In this stack those folders are Brownie projects** (`brownie-config.yaml`, `contracts/`, `scripts/`). There is **no** `hardhat.config.*` here, so Hardhat will not compile anything unless you add your own config.

| Instead of | Use |
|------------|-----|
| `npx hardhat compile` | `brownie compile` (from `core/` or `operator/`) |
| Vague “run deploy” | The exact `brownie run …` lines below (same names as in the script headers) |

---

## Get `core` / `operator` into this tree

### Option A — Git submodules (parent repo tracks pointers)

If the **parent** repository defines `core` and `operator` as submodules, initialize them after clone:

```bash
git submodule update --init --recursive
```

Shallow fetch (optional, smaller download):

```bash
git submodule update --init --recursive --depth 1
```

If you cloned the parent without submodules, you may need:

```bash
git submodule update --init --recursive
```

### Option B — Plain clones (no submodule)

Use the two `git clone https://github.com/NoFeeSwap/...` commands in the section above, and place `core/` and `operator/` next to `no-fee-swap-ui/` and `backend-script/`.

---

## Python / Brownie one-time setup (contracts)

Use a virtual environment so `brownie` and dependencies do not pollute your system Python.

**Windows (PowerShell or cmd):**

```bat
cd E:\no-fee-swap-test
python -m venv .venv
.venv\Scripts\activate.bat
pip install eth-brownie
```

**macOS / Linux:**

```bash
cd /path/to/no-fee-swap-test
python3 -m venv .venv
source .venv/bin/activate
pip install eth-brownie
```

If your checkout of **NoFeeSwap/core** includes a `requirements.txt`, also run (from `core/`):

```bash
pip install -r requirements.txt
```

(Not all tags include that file; `eth-brownie` is the minimum you need for `brownie compile` and deploy scripts.)

**Compile both packages:**

```bash
cd core
brownie compile
cd ../operator
brownie compile
```

---

## Anvil (local node)

The deploy scripts’ docstrings recommend a zero base fee for simple local testing:

```bash
anvil --base-fee 0
```

Plain `anvil` also works with this repo’s `brownie-config.yaml` **anvil** network (`http://127.0.0.1:8545`, chain id **31337**). Keep one Anvil process running for the whole session.

---

## Deploy contracts (matches script headers)

Run from the **same machine** as Anvil, **after** `brownie compile` in each folder. Order matters: **core → tokens → operator**.

**Windows paths:**

```bat
cd E:\no-fee-swap-test\core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd E:\no-fee-swap-test\operator
brownie run deploy_operator --network anvil
```

**macOS / Linux:**

```bash
cd /path/to/no-fee-swap-test/core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd /path/to/no-fee-swap-test/operator
brownie run deploy_operator --network anvil
```

These names match the comments at the top of `core/scripts/deploy_core.py`, `core/scripts/deploy_tokens.py`, and `operator/scripts/deploy_operator.py`. Some Brownie versions also accept the long form, e.g. `brownie run scripts/deploy_core.py --network anvil`; use whichever your `brownie --help` lists.

After deploy, copy addresses from `core/deployments/*.json` and `operator/deployments/*.json` into `no-fee-swap-ui/.env.local` (and `backend-script/.env` if you use the bot).

---

## Prerequisites

Install these before you start:

| Tool | Why |
|------|-----|
| **Node.js** (LTS, e.g. 20+) | `no-fee-swap-ui` and `backend-script` |
| **npm** | Comes with Node |
| **Python 3.10+** | Brownie |
| **[Brownie](https://eth-brownie.readthedocs.io/)** | Compile and deploy Solidity from `core/` and `operator/` |
| **[Foundry](https://book.getfoundry.sh/)** — `anvil` | Local EVM node on `http://127.0.0.1:8545` |
| **MetaMask** (browser) | Connect the dApp to chain `31337` |

Optional:

- **Git** — version control; use a single repo at this root (see root `.gitignore`).

### Verify

```bash
node -v
npm -v
python --version
brownie --version
anvil --version
```

---

## One-time setup

### 1. Install JavaScript dependencies

```bash
cd no-fee-swap-ui && npm install && cd ..
cd backend-script && npm install && cd ..
```

### 2. Install Python / Brownie dependencies

See **Python / Brownie one-time setup** and **Compile both packages** above (venv + `pip install eth-brownie` + optional `requirements.txt` + `brownie compile` in `core/` and `operator/`).

If `brownie` is missing, install per [Brownie docs](https://eth-brownie.readthedocs.io/en/stable/install.html) and ensure the compiler version in `brownie-config.yaml` (e.g. solc **0.8.28**) can be fetched.

### 3. Configure the UI environment

After **deploying** contracts (so the JSON files exist), from **`no-fee-swap-ui/`**:

**Recommended — generate `.env.local` from deployment files:**

```bash
cd no-fee-swap-ui
npm run env:print
npm run env:write
```

- `env:print` — prints all `NEXT_PUBLIC_*` lines (and RPC / chain id) to the terminal.
- `env:write` — writes the same content to **`.env.local`** (gitignored).

Optional RPC override: `set RPC_URL=http://127.0.0.1:8545` (Windows) or `RPC_URL=... npm run env:print` (Unix).

**Manual —** copy the template and edit addresses:

```bash
copy .env.example .env.local
```

(On macOS/Linux: `cp .env.example .env.local`.)

Sources for addresses: `core/deployments/anvil-core.json`, `core/deployments/anvil-tokens.json`, `operator/deployments/anvil-operator.json`.

### 4. Configure the sandwich bot (optional)

Edit **`backend-script/.env`**: set `RPC_URL`, contract addresses, `TOKEN0` / `TOKEN1`, and `ATTACKER_PRIVATE_KEY`. After each deploy, align addresses with `core/deployments/*.json` and `operator/deployments/*.json`. See `backend-script/README.md` for variable descriptions.

---

## How to run (full stack)

Use **separate terminals**. Order matters: **Anvil → deploy → UI** (and optionally **bot**).

### Terminal A — Anvil

```bash
anvil --base-fee 0
```

Keep it running. Default RPC: `http://127.0.0.1:8545`, chain id **31337**. You can use plain `anvil` if you prefer.

> **Sandwich bot testing:** run `backend-script`’s `npm run setup` once per Anvil session so **auto-mine is off** and the mempool stays visible to the bot (see `backend-script/README.md`).

### Terminal B — Deploy contracts (same Anvil session)

**Important:** Redeploy whenever you restart Anvil (state is wiped).

Same commands as **Deploy contracts** above (short form):

```bash
cd core
brownie run deploy_core --network anvil
brownie run deploy_tokens --network anvil
cd ../operator
brownie run deploy_operator --network anvil
cd ..
```

Update `no-fee-swap-ui/.env.local` (and `backend-script/.env` if used) from the new JSON files under `deployments/`.

### Terminal C — Web UI

```bash
cd no-fee-swap-ui
npm run dev
```

Open **http://localhost:3000**.

### Terminal D — Sandwich bot (optional)

Only if you are testing Task 3 (mempool + sandwich):

```bash
cd backend-script
npm run setup
npm run dev
```

---

## MetaMask (local chain)

1. Add a custom network: **RPC** `http://127.0.0.1:8545`, **Chain ID** `31337`.
2. Import an Anvil test private key if you need a known account (Anvil prints keys on startup).
3. In the UI, click **Connect MetaMask** and ensure you are on chain **31337**.

---

## Using the UI (happy path)

Do this in order the first time:

1. **Contracts** — Confirm all addresses match your deployment JSONs.
2. **Initialize pool** — Confirm in MetaMask; wait for success modal; note **saved pool id** (stored in browser `localStorage`).
3. **Approve token0** and **Approve token1** to the operator (two transactions).
4. **Mint liquidity** — Set tick range and shares; confirm.
5. **Swap** — Enter amount, slippage, `zeroForOne` as needed; confirm.

If something reverts, read the error modal and check: pool initialized, correct tokens, approvals, and liquidity in range.

---

## How to test (checklist)

### A. Contracts & RPC

| Step | What to verify |
|------|----------------|
| Anvil running | `curl` or browser; no connection errors in UI |
| Deploy scripts | JSON files under `core/deployments/` and `operator/deployments/` updated |
| Wrong chain in MetaMask | UI should prompt to switch to local chain |

### B. UI — wallet

| Step | Expected |
|------|----------|
| Connect | Address shown; no hydration errors in browser console |
| Disconnect / reconnect | Still works |

### C. UI — pool & liquidity

| Step | Expected |
|------|----------|
| Init pool | Success modal with pool id / tx hash; pool survives page refresh (local storage) |
| Approve both tokens | Success modals; balances may be unchanged for approvals |
| Mint | Balances update (before → after in modal) |
| Burn | Balances move the opposite way |

### D. UI — swap

| Step | Expected |
|------|----------|
| Valid swap | Progress message, then success modal with balance delta |
| Invalid amount (non-numeric) | Error before sending tx |
| User rejects in MetaMask | Error modal, no chain state change |

### E. Brownie (optional, from repo root)

```bash
cd core
brownie test
```

Run operator tests if present:

```bash
cd operator
brownie test
```

Interpret failures against your local Solidity and Python versions.

### F. Sandwich bot (optional)

| Step | Expected |
|------|----------|
| `npm run setup` | Auto-mine disabled; attacker funded |
| `npm run dev` | Logs connected; polling mempool |
| UI swap while bot runs | Bot logs pending swap, front-run / back-run txs, then mine |

If swaps never appear as “pending,” auto-mine may still be on — rerun `npm run setup` for that Anvil session.

### G. Production build (UI)

```bash
cd no-fee-swap-ui
npm run build
npm run start
```

Use this to catch type and build errors before demos.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| UI shows wrong “Connect” state | Hard refresh; ensure `mounted` gating in UI (no SSR/client mismatch) |
| Transactions fail immediately | Same Anvil session as deploy? Addresses in `.env.local` match JSON? |
| `brownie` network errors | `brownie-config.yaml` `anvil` host `127.0.0.1:8545`, chain id 31337 |
| `npx hardhat compile` fails | Expected: use **`brownie compile`** in `core/` and `operator/` (Brownie projects, not Hardhat) |
| Too many Git repos in Cursor sidebar | Reload window after pulling `.vscode/settings.json`; nested `lib/` repos are ignored for scanning |
| `node_modules` in Git | Ensure root `.gitignore` is used; do not commit `node_modules` |

---

## Scripts quick reference

| Location | Command | Purpose |
|----------|---------|---------|
| `no-fee-swap-ui/` | `npm run dev` | Dev server |
| `no-fee-swap-ui/` | `npm run env:print` | Print `NEXT_PUBLIC_*` from deployment JSONs |
| `no-fee-swap-ui/` | `npm run env:write` | Write `.env.local` from deployment JSONs |
| `no-fee-swap-ui/` | `npm run build` | Production build |
| `backend-script/` | `npm run setup` | Anvil: auto-mine off + fund attacker |
| `backend-script/` | `npm run dev` | Run sandwich bot |
| `core/` | `brownie run deploy_core --network anvil` | Deploy core (see `scripts/deploy_core.py`) |
| `core/` | `brownie run deploy_tokens --network anvil` | Deploy mock ERC20s |
| `operator/` | `brownie run deploy_operator --network anvil` | Deploy operator |
| `core/` / `operator/` | `brownie run scripts/deploy_*.py --network anvil` | Longer form if your Brownie version requires it |

---

## Security note

Local Anvil keys and `.env` files are for **development only**. Never use real funds or mainnet keys in this setup.
