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

From each Solidity package (follow any project-specific `requirements.txt` or Brownie docs you use). Typical pattern:

```bash
cd core
brownie compile
cd ../operator
brownie compile
cd ..
```

If dependencies are missing, install Brownie per [official docs](https://eth-brownie.readthedocs.io/en/stable/install.html) and ensure solc matches the project.

### 3. Configure the UI environment

```bash
cd no-fee-swap-ui
copy .env.example .env.local
```

On macOS/Linux use `cp .env.example .env.local`.

Edit **`.env.local`**:

- `NEXT_PUBLIC_RPC_URL` — `http://127.0.0.1:8545`
- `NEXT_PUBLIC_CHAIN_ID` — `31337`
- `NEXT_PUBLIC_NOFEESWAP`, `NEXT_PUBLIC_NOFEESWAP_DELEGATEE`, `NEXT_PUBLIC_OPERATOR`, `NEXT_PUBLIC_TOKEN0`, `NEXT_PUBLIC_TOKEN1`

After you deploy (next section), copy addresses from:

- `core/deployments/anvil-core.json`
- `core/deployments/anvil-tokens.json`
- `operator/deployments/anvil-operator.json`

### 4. Configure the sandwich bot (optional)

Edit **`backend-script/.env`**: set `RPC_URL`, contract addresses, `TOKEN0` / `TOKEN1`, and `ATTACKER_PRIVATE_KEY`. After each deploy, align addresses with `core/deployments/*.json` and `operator/deployments/*.json`. See `backend-script/README.md` for variable descriptions.

---

## How to run (full stack)

Use **separate terminals**. Order matters: **Anvil → deploy → UI** (and optionally **bot**).

### Terminal A — Anvil

```bash
anvil
```

Keep it running. Default RPC: `http://127.0.0.1:8545`, chain id **31337**.

> **Sandwich bot testing:** run `backend-script`’s `npm run setup` once per Anvil session so **auto-mine is off** and the mempool stays visible to the bot (see `backend-script/README.md`).

### Terminal B — Deploy contracts (same Anvil session)

**Important:** Redeploy whenever you restart Anvil (state is wiped).

```bash
cd core
brownie run scripts/deploy_core.py --network anvil
brownie run scripts/deploy_tokens.py --network anvil
cd ../operator
brownie run scripts/deploy_operator.py --network anvil
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
| Too many Git repos in Cursor sidebar | Reload window after pulling `.vscode/settings.json`; nested `lib/` repos are ignored for scanning |
| `node_modules` in Git | Ensure root `.gitignore` is used; do not commit `node_modules` |

---

## Scripts quick reference

| Location | Command | Purpose |
|----------|---------|---------|
| `no-fee-swap-ui/` | `npm run dev` | Dev server |
| `no-fee-swap-ui/` | `npm run build` | Production build |
| `backend-script/` | `npm run setup` | Anvil: auto-mine off + fund attacker |
| `backend-script/` | `npm run dev` | Run sandwich bot |
| `core/` | `brownie run scripts/deploy_core.py --network anvil` | Deploy core |
| `core/` | `brownie run scripts/deploy_tokens.py --network anvil` | Deploy mock ERC20s |
| `operator/` | `brownie run scripts/deploy_operator.py --network anvil` | Deploy operator |

---

## Security note

Local Anvil keys and `.env` files are for **development only**. Never use real funds or mainnet keys in this setup.
