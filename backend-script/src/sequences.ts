/**
 * Build operator-unlock bytecodes for the attacker's front-run and back-run swaps.
 * Mirrors the encoding in no-fee-swap-ui/src/lib/nofeeswap/sequences.ts.
 */

import { type Address, type Hex, concatHex, numberToHex, pad, size as hexSize } from "viem";

const PUSH32 = 3;
const NEG = 4;
const LT = 13;
const ISZERO = 16;
const JUMPDEST = 20;
const JUMP = 21;
const TRANSFER_FROM_PAYER_ERC20 = 37;
const TAKE_TOKEN = 42;
const SYNC_TOKEN = 45;
const SETTLE = 47;
const SWAP = 52;
const REVERT = 59;

const X63 = 2n ** 63n;

function ep(types: string[], values: unknown[]): Hex {
  const parts: Hex[] = [];
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const v = values[i];
    if (t === "uint8")
      parts.push(pad(numberToHex((v as number) & 0xff, { size: 1 }), { size: 1 }) as Hex);
    else if (t === "uint16")
      parts.push(pad(numberToHex((v as number) & 0xffff, { size: 2 }), { size: 2 }) as Hex);
    else if (t === "uint64")
      parts.push(
        pad(numberToHex(BigInt(v as string | number | bigint) & ((1n << 64n) - 1n), { size: 8 }), { size: 8 }) as Hex,
      );
    else if (t === "uint256")
      parts.push(
        pad(numberToHex(BigInt(v as string | number | bigint) & ((1n << 256n) - 1n), { size: 32 }), { size: 32 }) as Hex,
      );
    else if (t === "int256") {
      const mod = 1n << 256n;
      let x = BigInt(v as string | number | bigint) % mod;
      if (x < 0n) x += mod;
      parts.push(pad(numberToHex(x, { size: 32 }), { size: 32 }) as Hex);
    } else if (t === "address") parts.push(pad(v as `0x${string}`, { size: 20 }) as Hex);
    else if (t === "bytes") {
      const hx = (v as Hex) || "0x";
      parts.push(hx === "0x" ? "0x" : (hx as Hex));
    } else throw new Error(`unsupported type: ${t}`);
  }
  return concatHex(parts);
}

function sumLens(seqs: Hex[]): number {
  let s = 0;
  for (const h of seqs) s += hexSize(h);
  return s;
}

function packPayload(deadline: number, parts: Hex[]): Hex {
  const head = pad(numberToHex(BigInt(deadline >>> 0), { size: 4 }), { size: 4 }) as Hex;
  return concatHex([head, ...parts]);
}

/**
 * Build a swap bytecode identical to the UI's swapSequence.
 * Used by both the front-run and back-run legs.
 */
export function buildSwapSequence(
  nofeeswap: Address,
  token0: Address,
  token1: Address,
  payer: Address,
  poolId: bigint,
  amountSpecified: bigint,
  limitOffsetted: bigint,
  zeroForOne: number,
  hookData: Hex,
  deadline: number,
): Hex {
  const successSlot = 2;
  const amount0Slot = 3;
  const amount1Slot = 4;
  const successSlotTransfer0 = 7;
  const successSlotTransfer1 = 8;
  const valueSlotSettle0 = 9;
  const successSlotSettle0 = 10;
  const resultSlotSettle0 = 11;
  const valueSlotSettle1 = 12;
  const successSlotSettle1 = 13;
  const resultSlotSettle1 = 14;
  const amountSpecifiedSlot = 15;
  const zeroSlot = 100;
  const logicSlot = 200;

  const hookLen = (hookData.length - 2) / 2;
  const seq: Hex[] = new Array(27);

  seq[0] = ep(["uint8", "int256", "uint8"], [PUSH32, amountSpecified, amountSpecifiedSlot]);
  seq[1] = ep(
    ["uint8", "uint256", "uint8", "uint64", "uint8", "uint8", "uint8", "uint8", "uint8", "uint16", "bytes"],
    [SWAP, poolId, amountSpecifiedSlot, limitOffsetted, zeroForOne, zeroSlot, successSlot, amount0Slot, amount1Slot, hookLen, hookData],
  );
  seq[2] = ep(["uint8", "uint16", "uint8"], [0, 0, 0]);
  seq[3] = ep(["uint8"], [REVERT]);
  seq[4] = ep(["uint8"], [JUMPDEST]);
  seq[2] = ep(["uint8", "uint16", "uint8"], [JUMP, sumLens(seq.slice(0, 4)), successSlot]);

  seq[5] = ep(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount0Slot, logicSlot]);
  seq[6] = ep(["uint8", "uint16", "uint8"], [0, 0, 0]);
  seq[7] = ep(["uint8", "uint8", "uint8"], [NEG, amount0Slot, amount0Slot]);
  seq[8] = ep(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token0, payer, amount0Slot, successSlotSettle0],
  );
  seq[9] = ep(["uint8"], [JUMPDEST]);
  seq[6] = ep(["uint8", "uint16", "uint8"], [JUMP, sumLens(seq.slice(0, 9)), logicSlot]);

  seq[10] = ep(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]);
  seq[11] = ep(["uint8", "uint16", "uint8"], [0, 0, 0]);
  seq[12] = ep(["uint8", "address"], [SYNC_TOKEN, token0]);
  seq[13] = ep(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token0, amount0Slot, nofeeswap, successSlotTransfer0, 0],
  );
  seq[14] = ep(["uint8", "uint8", "uint8", "uint8"], [SETTLE, valueSlotSettle0, successSlotSettle0, resultSlotSettle0]);
  seq[15] = ep(["uint8"], [JUMPDEST]);
  seq[11] = ep(["uint8", "uint16", "uint8"], [JUMP, sumLens(seq.slice(0, 15)), logicSlot]);

  seq[16] = ep(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount1Slot, logicSlot]);
  seq[17] = ep(["uint8", "uint16", "uint8"], [0, 0, 0]);
  seq[18] = ep(["uint8", "uint8", "uint8"], [NEG, amount1Slot, amount1Slot]);
  seq[19] = ep(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token1, payer, amount1Slot, successSlotSettle1],
  );
  seq[20] = ep(["uint8"], [JUMPDEST]);
  seq[17] = ep(["uint8", "uint16", "uint8"], [JUMP, sumLens(seq.slice(0, 20)), logicSlot]);

  seq[21] = ep(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]);
  seq[22] = ep(["uint8", "uint16", "uint8"], [0, 0, 0]);
  seq[23] = ep(["uint8", "address"], [SYNC_TOKEN, token1]);
  seq[24] = ep(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token1, amount1Slot, nofeeswap, successSlotTransfer1, 0],
  );
  seq[25] = ep(["uint8", "uint8", "uint8", "uint8"], [SETTLE, valueSlotSettle1, successSlotSettle1, resultSlotSettle1]);
  seq[26] = ep(["uint8"], [JUMPDEST]);
  seq[22] = ep(["uint8", "uint16", "uint8"], [JUMP, sumLens(seq.slice(0, 26)), logicSlot]);

  return packPayload(deadline, seq);
}

/**
 * Compute the offsetted limit for the attacker's swap.
 * For the front-run we want the most aggressive limit (maximally move the price).
 * For the back-run we want the opposite extreme.
 */
export function attackerLimit(
  poolId: bigint,
  isFrontRun: boolean,
  victimZeroForOne: number,
): bigint {
  let logOffset = Number((poolId >> 180n) & 0xffn);
  if (logOffset >= 128) logOffset -= 256;

  // Front-run: same direction as victim, use max/min limit to push price aggressively
  // Back-run: opposite direction, use opposite extreme
  const sameDirection = isFrontRun;
  const directionIsDown = sameDirection
    ? victimZeroForOne === 2
    : victimZeroForOne !== 2;

  // zeroForOne=2 means selling token0 for token1, price goes DOWN → limit near 0
  // zeroForOne=1 means selling token1 for token0, price goes UP → limit near max
  if (directionIsDown) {
    return 1n; // lowest possible limit (price can go down as much as possible)
  } else {
    return (1n << 64n) - 2n; // highest possible limit
  }
}
