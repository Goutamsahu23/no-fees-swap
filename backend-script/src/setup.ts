/**
 * One-time setup script: configures Anvil for manual mining and funds the
 * attacker account with both mock ERC20 tokens.
 *
 * Run:  npm run setup
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Hex,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localhost as viemLocalhost } from "viem/chains";
import { RPC_URL, TOKEN0, TOKEN1, OPERATOR, ATTACKER_PRIVATE_KEY } from "./config.js";
import { erc20Abi } from "./abis.js";

const chain = { ...viemLocalhost, id: 31337 };

// Anvil account #0 (deployer / token minter) — has all the tokens
const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const attackerAccount = privateKeyToAccount(ATTACKER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

const deployerWallet = createWalletClient({
  account: deployerAccount,
  chain,
  transport: http(RPC_URL),
});

const attackerWallet = createWalletClient({
  account: attackerAccount,
  chain,
  transport: http(RPC_URL),
});

// Simple ERC20 transfer ABI
const transferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SANDWICH BOT SETUP");
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Disable auto-mining so txs stay in the mempool
  console.log("[setup] Disabling auto-mine on Anvil …");
  const autoMineRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "evm_setAutomine",
      params: [false],
    }),
  });
  const autoMineJson = (await autoMineRes.json()) as { result?: unknown };
  console.log(`[setup] evm_setAutomine(false) →`, autoMineJson.result ?? "ok");

  // Also set a mining interval of 0 (fully manual)
  const intervalRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "evm_setIntervalMining",
      params: [0],
    }),
  });
  const intervalJson = (await intervalRes.json()) as { result?: unknown };
  console.log(`[setup] evm_setIntervalMining(0) →`, intervalJson.result ?? "ok");

  // 2. Fund attacker with tokens
  console.log(`\n[setup] Attacker address: ${attackerAccount.address}`);
  console.log(`[setup] Deployer address: ${deployerAccount.address}`);

  const amount = parseUnits("100000", 18); // 100k tokens each

  console.log(`[setup] Transferring 100,000 of each token to attacker …`);

  // Mine transfers since automine is off now
  const hash0 = await deployerWallet.writeContract({
    address: TOKEN0,
    abi: transferAbi,
    functionName: "transfer",
    args: [attackerAccount.address, amount],
  });
  console.log(`[setup]   token0 transfer tx: ${hash0}`);

  // Mine this block
  await mineBlock();

  const hash1 = await deployerWallet.writeContract({
    address: TOKEN1,
    abi: transferAbi,
    functionName: "transfer",
    args: [attackerAccount.address, amount],
  });
  console.log(`[setup]   token1 transfer tx: ${hash1}`);

  await mineBlock();

  // 3. Approve operator
  console.log(`[setup] Approving operator for attacker …`);

  const ah0 = await attackerWallet.writeContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "approve",
    args: [OPERATOR, maxUint256],
  });
  await mineBlock();
  console.log(`[setup]   approve token0 tx: ${ah0}`);

  const ah1 = await attackerWallet.writeContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "approve",
    args: [OPERATOR, maxUint256],
  });
  await mineBlock();
  console.log(`[setup]   approve token1 tx: ${ah1}`);

  // 4. Verify
  const bal0 = (await publicClient.readContract({
    address: TOKEN0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [attackerAccount.address],
  })) as bigint;
  const bal1 = (await publicClient.readContract({
    address: TOKEN1,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [attackerAccount.address],
  })) as bigint;

  console.log(`\n[setup] Attacker token0 balance: ${bal0}`);
  console.log(`[setup] Attacker token1 balance: ${bal1}`);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  SETUP COMPLETE — Auto-mine is OFF");
  console.log("  Run 'npm run dev' to start the sandwich bot.");
  console.log("═══════════════════════════════════════════════════════\n");
}

async function mineBlock() {
  await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 99,
      method: "evm_mine",
      params: [],
    }),
  });
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
