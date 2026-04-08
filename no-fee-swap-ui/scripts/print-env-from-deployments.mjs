/**
 * Reads Anvil deployment JSONs and prints (or writes) no-fee-swap-ui .env.local lines.
 *
 * Usage (from no-fee-swap-ui/):
 *   node scripts/print-env-from-deployments.mjs
 *   node scripts/print-env-from-deployments.mjs --write
 *   npm run env:print
 *   npm run env:write
 *
 * Paths are resolved from the repository root (two levels above this file).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const uiRoot = join(__dirname, "..");

const CORE = join(repoRoot, "core", "deployments", "anvil-core.json");
const TOKENS = join(repoRoot, "core", "deployments", "anvil-tokens.json");
const OPERATOR = join(repoRoot, "operator", "deployments", "anvil-operator.json");

function loadJson(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    console.error("Deploy contracts first (brownie run deploy_* --network anvil).");
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildLines() {
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const core = loadJson(CORE, "anvil-core.json");
  const tokens = loadJson(TOKENS, "anvil-tokens.json");
  const operator = loadJson(OPERATOR, "anvil-operator.json");

  const chainId = core.chainId ?? tokens.chainId ?? operator.chainId ?? 31337;

  const lines = [
    "# Generated from core/deployments and operator/deployments — do not commit .env.local",
    `# Source files:`,
    `#   ${CORE}`,
    `#   ${TOKENS}`,
    `#   ${OPERATOR}`,
    "",
    `NEXT_PUBLIC_RPC_URL=${rpc}`,
    `NEXT_PUBLIC_CHAIN_ID=${String(chainId)}`,
    "",
    `NEXT_PUBLIC_NOFEESWAP=${core.nofeeswap}`,
    `NEXT_PUBLIC_NOFEESWAP_DELEGATEE=${core.nofeeswapDelegatee}`,
    `NEXT_PUBLIC_OPERATOR=${operator.operator}`,
    `NEXT_PUBLIC_TOKEN0=${tokens.token0}`,
    `NEXT_PUBLIC_TOKEN1=${tokens.token1}`,
    "",
  ];

  return lines.join("\n");
}

const write = process.argv.includes("--write") || process.argv.includes("-w");
const out = buildLines();

if (write) {
  const dest = join(uiRoot, ".env.local");
  writeFileSync(dest, out, "utf8");
  console.log(`Wrote ${dest}\n`);
}

process.stdout.write(out);
if (!write) {
  process.stdout.write("\n# Tip: npm run env:write  (or --write) to save as .env.local\n");
}
