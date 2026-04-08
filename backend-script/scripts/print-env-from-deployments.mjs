/**
 * Reads Anvil deployment JSONs and prints (or writes) backend-script `.env` lines.
 *
 * Usage (from backend-script/):
 *   node scripts/print-env-from-deployments.mjs
 *   node scripts/print-env-from-deployments.mjs --write
 *   npm run env:print
 *   npm run env:write
 *
 * Optional env when generating:
 *   RPC_URL          — default http://127.0.0.1:8545
 *   ATTACKER_PRIVATE_KEY — default Anvil account #1 (see script output comment)
 *   MIN_PROFIT_WEI   — default 0
 *   POLL_INTERVAL_MS — default 200
 *
 * Paths resolve from repo root (two levels above this file).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const botRoot = join(__dirname, "..");

const CORE = join(repoRoot, "core", "deployments", "anvil-core.json");
const TOKENS = join(repoRoot, "core", "deployments", "anvil-tokens.json");
const OPERATOR = join(repoRoot, "operator", "deployments", "anvil-operator.json");

/** Anvil default account #1 — use a different key via ATTACKER_PRIVATE_KEY in your shell if needed */
const DEFAULT_ANVIL_ATTACKER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function loadJson(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    console.error("Deploy contracts first (brownie run deploy_* --network anvil).");
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildLines() {
  const core = loadJson(CORE, "anvil-core.json");
  const tokens = loadJson(TOKENS, "anvil-tokens.json");
  const operator = loadJson(OPERATOR, "anvil-operator.json");

  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const attackerKey = process.env.ATTACKER_PRIVATE_KEY ?? DEFAULT_ANVIL_ATTACKER_KEY;
  const minProfit = process.env.MIN_PROFIT_WEI ?? "0";
  const pollMs = process.env.POLL_INTERVAL_MS ?? "200";

  const lines = [
    "# Generated from core/deployments and operator/deployments — do not commit .env",
    `# Source files:`,
    `#   ${CORE}`,
    `#   ${TOKENS}`,
    `#   ${OPERATOR}`,
    "#",
    "# ATTACKER_PRIVATE_KEY: default is Anvil account #1. Override: set ATTACKER_PRIVATE_KEY when running this script.",
    "",
    "# Anvil RPC",
    `RPC_URL=${rpc}`,
    "",
    "# Contract addresses (from core/operator deployments)",
    `NOFEESWAP=${core.nofeeswap}`,
    `NOFEESWAP_DELEGATEE=${core.nofeeswapDelegatee}`,
    `OPERATOR=${operator.operator}`,
    "",
    "# Token addresses (sorted: token0 < token1)",
    `TOKEN0=${tokens.token0}`,
    `TOKEN1=${tokens.token1}`,
    "",
    "# Attacker private key — use an account that is NOT the UI user (e.g. Anvil #1)",
    `ATTACKER_PRIVATE_KEY=${attackerKey}`,
    "",
    "# Minimum profitability threshold in wei before executing sandwich",
    `MIN_PROFIT_WEI=${minProfit}`,
    "",
    "# Polling interval (ms) for pending txpool scans",
    `POLL_INTERVAL_MS=${pollMs}`,
    "",
  ];

  return lines.join("\n");
}

const write = process.argv.includes("--write") || process.argv.includes("-w");
const out = buildLines();

if (write) {
  const dest = join(botRoot, ".env");
  writeFileSync(dest, out, "utf8");
  console.log(`Wrote ${dest}\n`);
}

process.stdout.write(out);
if (!write) {
  process.stdout.write(
    "\n# Tip: npm run env:write  (or --write) to save as .env in backend-script/\n",
  );
}
