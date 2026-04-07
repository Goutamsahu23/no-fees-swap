/**
 * Sandwich Attack Bot — Main Entry Point
 *
 * Monitors the Anvil mempool for pending NoFeeSwap swap transactions,
 * decodes their calldata to extract slippage & trade size, and if
 * profitable, constructs a front-run + back-run sandwich around the
 * victim's swap.
 *
 * Usage:
 *   1. Start Anvil:       anvil
 *   2. Deploy contracts:  (brownie scripts in core/ and operator/)
 *   3. Setup bot:         npm run setup   (funds attacker, disables auto-mine)
 *   4. Run bot:           npm run dev
 *   5. Use the UI to swap — the bot will detect and sandwich it.
 */

import "dotenv/config";
import { watchMempool, type PendingSwap } from "./monitor.js";
import { executeSandwich } from "./sandwich.js";
import { MIN_PROFIT_WEI, NOFEESWAP, OPERATOR, RPC_URL } from "./config.js";

let sandwichCount = 0;
let totalProfit = 0n;

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SANDWICH ATTACK BOT — NoFeeSwap Local Testnet");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  RPC:        ${RPC_URL}`);
  console.log(`  Nofeeswap:  ${NOFEESWAP}`);
  console.log(`  Operator:   ${OPERATOR}`);
  console.log(`  Min profit: ${MIN_PROFIT_WEI} wei`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Verify Anvil is reachable and auto-mine is off
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    const json = (await res.json()) as { result?: string };
    console.log(`[bot] Connected to node at block ${parseInt(json.result ?? "0", 16)}`);
  } catch {
    console.error("[bot] Cannot reach Anvil at", RPC_URL);
    console.error("[bot] Start it with: anvil");
    process.exit(1);
  }

  // Verify auto-mine is disabled
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "anvil_getAutomine",
        params: [],
      }),
    });
    const json = (await res.json()) as { result?: boolean };
    if (json.result === true) {
      console.warn(
        "[bot] WARNING: Auto-mine is ON. Transactions will be mined instantly.",
      );
      console.warn(
        "[bot] Run 'npm run setup' first to disable auto-mine, or the bot won't",
      );
      console.warn(
        "[bot] be able to detect pending transactions in the mempool.\n",
      );
    } else {
      console.log("[bot] Auto-mine is OFF — mempool monitoring will work.\n");
    }
  } catch {
    // older Anvil may not support anvil_getAutomine — proceed anyway
  }

  console.log("[bot] Scanning mempool for pending swap transactions…\n");

  for await (const pending of watchMempool()) {
    console.log(
      `[bot] New swap detected from ${pending.from} — amount=${pending.decoded.amountSpecified}`,
    );

    try {
      const result = await executeSandwich(pending);
      if (result) {
        sandwichCount++;
        totalProfit += result.profit;
        console.log(
          `[bot] Sandwich #${sandwichCount} complete. Running total profit: ${totalProfit}\n`,
        );
      }
    } catch (err) {
      console.error(
        "[bot] Sandwich execution error:",
        (err as Error).message,
        "\n",
      );
    }
  }
}

main().catch((err) => {
  console.error("Bot crashed:", err);
  process.exit(1);
});
