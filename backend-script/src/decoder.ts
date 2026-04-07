/**
 * Decodes the operator unlock bytecode to extract swap parameters.
 *
 * The unlock(address, bytes) calldata is:
 *   selector (4) + abi-encoded (address unlockTarget, bytes data)
 *
 * The `data` field is the packed operator sequence with layout:
 *   deadline (4 bytes) + sequence of opcodes
 *
 * For a swap the sequence starts with:
 *   PUSH32 (opcode 3): 1 + 32 + 1 = 34 bytes
 *   SWAP   (opcode 52): 1 + 32 (poolId) + 1 (amountSlot) + 8 (limit) + 1 (zeroForOne) + ...
 *
 * We detect the SWAP opcode (0x34 = 52) and read all fields from their known offsets.
 */

import type { Hex } from "viem";
import { decodeFunctionData } from "viem";
import { nofeeswapAbi } from "./abis.js";

const OPCODE_PUSH32 = 3;
const OPCODE_SWAP = 52;

const X63 = 2n ** 63n;

export interface DecodedSwap {
  poolId: bigint;
  amountSpecified: bigint;
  limitOffsetted: bigint;
  zeroForOne: number;
  logOffset: number;
  /** The original log-price limit reconstructed from the offsetted value */
  logPriceLimit: bigint;
  /** Implied max slippage as a fraction (0..1) from the limit vs a reference price */
  impliedSlippageBps: number;
}

function readUint8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function readBigUint256(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 32; i++) {
    v = (v << 8n) | BigInt(buf[off + i]);
  }
  return v;
}

function readBigInt256(buf: Uint8Array, off: number): bigint {
  const raw = readBigUint256(buf, off);
  const mod = 1n << 256n;
  const half = 1n << 255n;
  return raw >= half ? raw - mod : raw;
}

function readBigUint64(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 8n) | BigInt(buf[off + i]);
  }
  return v;
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

/**
 * Try to decode `unlock(address, bytes)` calldata and extract swap params.
 * Returns null if this isn't a swap transaction.
 */
export function decodeSwapFromCalldata(calldata: Hex): DecodedSwap | null {
  try {
    const { functionName, args } = decodeFunctionData({
      abi: nofeeswapAbi,
      data: calldata,
    });

    if (functionName !== "unlock") return null;

    const data = args[1] as Hex;
    const buf = hexToBytes(data);

    // Skip 4-byte deadline
    let cursor = 4;

    // Find PUSH32 followed by SWAP
    let amountSpecified: bigint | null = null;
    let swapFound = false;

    while (cursor < buf.length - 1) {
      const opcode = readUint8(buf, cursor);

      if (opcode === OPCODE_PUSH32) {
        // PUSH32: 1 (opcode) + 32 (value) + 1 (slot) = 34 bytes
        if (cursor + 34 > buf.length) break;
        amountSpecified = readBigInt256(buf, cursor + 1);
        cursor += 34;
        continue;
      }

      if (opcode === OPCODE_SWAP) {
        // SWAP layout after opcode byte:
        //   uint256 poolId          (32)
        //   uint8   amountSlot      (1)
        //   uint64  limitOffsetted  (8)
        //   uint8   zeroForOne      (1)
        //   uint8   zeroSlot        (1)
        //   uint8   successSlot     (1)
        //   uint8   amount0Slot     (1)
        //   uint8   amount1Slot     (1)
        //   uint16  hookLen         (2)
        //   bytes   hookData        (hookLen)
        if (cursor + 1 + 32 + 1 + 8 + 1 > buf.length) break;

        const poolId = readBigUint256(buf, cursor + 1);
        // skip amountSlot (1 byte after poolId)
        const limitOffsetted = readBigUint64(buf, cursor + 1 + 32 + 1);
        const zeroForOne = readUint8(buf, cursor + 1 + 32 + 1 + 8);

        let logOffset = Number((poolId >> 180n) & 0xffn);
        if (logOffset >= 128) logOffset -= 256;

        const logPriceLimit =
          limitOffsetted - X63 + BigInt(logOffset) * (1n << 59n);

        // Rough slippage estimate: compare limit to mid-range
        // The exact slippage depends on current spot price (we estimate from the limit distance)
        const impliedSlippageBps = estimateSlippageBps(limitOffsetted, zeroForOne);

        swapFound = true;

        return {
          poolId,
          amountSpecified: amountSpecified ?? 0n,
          limitOffsetted,
          zeroForOne,
          logOffset,
          logPriceLimit,
          impliedSlippageBps,
        };
      }

      // Unknown opcode — try to skip. Different opcodes have different lengths.
      // For safety, we break on unknown opcodes.
      break;
    }

    if (!swapFound) return null;
    return null;
  } catch {
    return null;
  }
}

function estimateSlippageBps(limitOffsetted: bigint, zeroForOne: number): number {
  // The limit is an X64-encoded log-price offset by X63.
  // Approximate slippage by looking at how far the limit deviates from the midpoint (X63).
  // This is a rough heuristic; real-world bots would compare to actual spot.
  const mid = X63;
  const diff = limitOffsetted > mid
    ? Number(limitOffsetted - mid)
    : Number(mid - limitOffsetted);
  const bps = Math.round((diff / Number(mid)) * 10000);
  return Math.min(bps, 10000);
}

/**
 * Extract only addresses that appear in TAKE_TOKEN opcodes (the "payer" / recipient).
 * In the swap sequence the victim address is the `payer` arg of TAKE_TOKEN (opcode 42).
 */
export function extractPayerFromCalldata(calldata: Hex): Hex | null {
  try {
    const { functionName, args } = decodeFunctionData({
      abi: nofeeswapAbi,
      data: calldata,
    });
    if (functionName !== "unlock") return null;

    const data = args[1] as Hex;
    const buf = hexToBytes(data);
    let cursor = 4; // skip deadline

    while (cursor < buf.length - 1) {
      const op = readUint8(buf, cursor);

      if (op === OPCODE_PUSH32) {
        cursor += 34;
        continue;
      }

      if (op === 42) {
        // TAKE_TOKEN: 1 + 20 (token) + 20 (payer) + 1 (slot) + 1 (successSlot) = 43
        if (cursor + 43 > buf.length) return null;
        const payerBytes = buf.slice(cursor + 1 + 20, cursor + 1 + 20 + 20);
        const hex = Array.from(payerBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return `0x${hex}` as Hex;
      }

      // Skip known opcodes by their fixed sizes
      const skip = opcodeSizes(op);
      if (skip === null) break;
      cursor += skip;
    }
    return null;
  } catch {
    return null;
  }
}

/** Return byte length for common opcodes so we can skip through the bytecode. */
function opcodeSizes(op: number): number | null {
  switch (op) {
    case 3:  return 34; // PUSH32
    case 4:  return 3;  // NEG
    case 13: return 4;  // LT
    case 16: return 3;  // ISZERO
    case 20: return 1;  // JUMPDEST
    case 21: return 4;  // JUMP
    case 37: return 44; // TRANSFER_FROM_PAYER_ERC20
    case 42: return 43; // TAKE_TOKEN
    case 45: return 21; // SYNC_TOKEN
    case 47: return 4;  // SETTLE
    case 50: return 35; // MODIFY_SINGLE_BALANCE
    case 59: return 1;  // REVERT
    default: return null;
  }
}
