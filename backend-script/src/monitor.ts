/**
 * Mempool monitor — polls Anvil's txpool_content for pending swap transactions
 * targeting the Nofeeswap contract.
 */

import {
  createPublicClient,
  http,
  type Hex,
  type Address,
  type TransactionRequest,
} from "viem";
import { RPC_URL, NOFEESWAP, OPERATOR, POLL_INTERVAL_MS } from "./config.js";
import { decodeSwapFromCalldata, extractPayerFromCalldata, type DecodedSwap } from "./decoder.js";

export interface PendingSwap {
  txHash: Hex;
  from: Address;
  to: Address;
  nonce: number;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  calldata: Hex;
  decoded: DecodedSwap;
  victimAddress: Address;
}

const seenTxs = new Set<string>();

/**
 * Single pass: fetch pending pool from Anvil and return new swap txs.
 */
export async function scanPendingSwaps(): Promise<PendingSwap[]> {
  const results: PendingSwap[] = [];

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "txpool_content",
        params: [],
      }),
    });

    const json = (await response.json()) as {
      result?: {
        pending?: Record<string, Record<string, RawTx>>;
        queued?: Record<string, Record<string, RawTx>>;
      };
    };

    if (!json.result?.pending) return results;

    for (const [sender, nonces] of Object.entries(json.result.pending)) {
      for (const [, tx] of Object.entries(nonces)) {
        const txHash = tx.hash as Hex;
        if (seenTxs.has(txHash)) continue;
        seenTxs.add(txHash);

        const to = (tx.to ?? "").toLowerCase();
        const nofeeswapLower = NOFEESWAP.toLowerCase();

        if (to !== nofeeswapLower) continue;

        const calldata = tx.input as Hex;
        const decoded = decodeSwapFromCalldata(calldata);
        if (!decoded) continue;

        const victimAddress =
          (extractPayerFromCalldata(calldata) as Address) ??
          (sender as Address);

        results.push({
          txHash,
          from: sender as Address,
          to: tx.to as Address,
          nonce: Number(tx.nonce),
          gasPrice: BigInt(tx.gasPrice ?? tx.maxFeePerGas ?? "0"),
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas
            ? BigInt(tx.maxPriorityFeePerGas)
            : undefined,
          calldata,
          decoded,
          victimAddress,
        });
      }
    }
  } catch (err) {
    console.error("[monitor] txpool scan error:", (err as Error).message);
  }

  return results;
}

interface RawTx {
  hash: string;
  to: string;
  from: string;
  nonce: string;
  input: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/**
 * Continuous loop that yields pending swaps as they appear.
 */
export async function* watchMempool(): AsyncGenerator<PendingSwap> {
  console.log(
    `[monitor] Watching mempool at ${RPC_URL} — polling every ${POLL_INTERVAL_MS}ms`,
  );
  console.log(`[monitor] Target contract: ${NOFEESWAP}`);
  console.log(`[monitor] Operator: ${OPERATOR}\n`);

  while (true) {
    const swaps = await scanPendingSwaps();
    for (const s of swaps) {
      yield s;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
