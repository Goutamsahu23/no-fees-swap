import { type Address, type Hex, concatHex, numberToHex, pad } from "viem";
import { encodePacked, sumLens } from "./packed";
import { X63 } from "./constants";
import {
  ISZERO,
  JUMP,
  JUMPDEST,
  LT,
  MODIFY_POSITION,
  MODIFY_SINGLE_BALANCE,
  NEG,
  PUSH32,
  REVERT,
  SETTLE,
  SWAP,
  SYNC_TOKEN,
  TAKE_TOKEN,
  TRANSFER_FROM_PAYER_ERC20,
} from "./actions";
import { offsetBoundsForModify } from "./poolMath";

function packUnlockPayload(deadline: number, parts: Hex[]): Hex {
  const head = pad(numberToHex(BigInt(deadline >>> 0), { size: 4 }), { size: 4 }) as Hex;
  return concatHex([head, ...parts]);
}

export function mintSequence(
  nofeeswap: Address,
  token0: Address,
  token1: Address,
  tagShares: bigint,
  poolId: bigint,
  qMin: bigint,
  qMax: bigint,
  shares: bigint,
  hookData: Hex,
  deadline: number,
): Hex {
  const sharesSlot = 1;
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
  const sharesSuccessSlot = 15;

  const { lower, upper } = offsetBoundsForModify(poolId, qMin, qMax);
  const lo = lower & ((1n << 64n) - 1n);
  const hi = upper & ((1n << 64n) - 1n);
  const hookLen = (hookData.length - 2) / 2;

  const sequence: Hex[] = new Array(9);
  sequence[0] = encodePacked(["uint8", "int256", "uint8"], [PUSH32, shares, sharesSlot]);
  sequence[1] = encodePacked(
    [
      "uint8",
      "uint256",
      "uint64",
      "uint64",
      "uint8",
      "uint8",
      "uint8",
      "uint8",
      "uint16",
      "bytes",
    ],
    [
      MODIFY_POSITION,
      poolId,
      lo,
      hi,
      sharesSlot,
      successSlot,
      amount0Slot,
      amount1Slot,
      hookLen,
      hookData,
    ],
  );
  sequence[2] = encodePacked(["uint8", "address"], [SYNC_TOKEN, token0]);
  sequence[3] = encodePacked(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token0, amount0Slot, nofeeswap, successSlotTransfer0, 0],
  );
  sequence[4] = encodePacked(
    ["uint8", "uint8", "uint8", "uint8"],
    [SETTLE, valueSlotSettle0, successSlotSettle0, resultSlotSettle0],
  );
  sequence[5] = encodePacked(["uint8", "address"], [SYNC_TOKEN, token1]);
  sequence[6] = encodePacked(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token1, amount1Slot, nofeeswap, successSlotTransfer1, 0],
  );
  sequence[7] = encodePacked(
    ["uint8", "uint8", "uint8", "uint8"],
    [SETTLE, valueSlotSettle1, successSlotSettle1, resultSlotSettle1],
  );
  sequence[8] = encodePacked(
    ["uint8", "uint256", "uint8", "uint8"],
    [MODIFY_SINGLE_BALANCE, tagShares, sharesSlot, sharesSuccessSlot],
  );

  return packUnlockPayload(deadline, sequence);
}

export function burnSequence(
  token0: Address,
  token1: Address,
  payer: Address,
  tagShares: bigint,
  poolId: bigint,
  qMin: bigint,
  qMax: bigint,
  shares: bigint,
  hookData: Hex,
  deadline: number,
): Hex {
  const sharesSlot = 1;
  const successSlot = 2;
  const amount0Slot = 3;
  const amount1Slot = 4;
  const successSlotSettle0 = 10;
  const successSlotSettle1 = 13;
  const sharesSuccessSlot = 15;

  const { lower, upper } = offsetBoundsForModify(poolId, qMin, qMax);
  const lo = lower & ((1n << 64n) - 1n);
  const hi = upper & ((1n << 64n) - 1n);
  const hookLen = (hookData.length - 2) / 2;

  const sequence: Hex[] = new Array(7);
  sequence[0] = encodePacked(["uint8", "int256", "uint8"], [PUSH32, -shares, sharesSlot]);
  sequence[1] = encodePacked(
    [
      "uint8",
      "uint256",
      "uint64",
      "uint64",
      "uint8",
      "uint8",
      "uint8",
      "uint8",
      "uint16",
      "bytes",
    ],
    [
      MODIFY_POSITION,
      poolId,
      lo,
      hi,
      sharesSlot,
      successSlot,
      amount0Slot,
      amount1Slot,
      hookLen,
      hookData,
    ],
  );
  sequence[2] = encodePacked(["uint8", "uint8", "uint8"], [NEG, amount0Slot, amount0Slot]);
  sequence[3] = encodePacked(["uint8", "uint8", "uint8"], [NEG, amount1Slot, amount1Slot]);
  sequence[4] = encodePacked(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token0, payer, amount0Slot, successSlotSettle0],
  );
  sequence[5] = encodePacked(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token1, payer, amount1Slot, successSlotSettle1],
  );
  sequence[6] = encodePacked(
    ["uint8", "uint256", "uint8", "uint8"],
    [MODIFY_SINGLE_BALANCE, tagShares, sharesSlot, sharesSuccessSlot],
  );

  return packUnlockPayload(deadline, sequence);
}

export function swapSequence(
  nofeeswap: Address,
  token0: Address,
  token1: Address,
  payer: Address,
  poolId: bigint,
  amountSpecified: bigint,
  limit: bigint,
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

  let logOffset = Number((poolId >> 180n) & 0xffn);
  if (logOffset >= 128) logOffset -= 256;

  let limitOffsetted = limit + X63 - BigInt(logOffset) * (1n << 59n);
  if (limitOffsetted < 0n) limitOffsetted = 0n;
  if (limitOffsetted >= 1n << 64n) limitOffsetted = (1n << 64n) - 1n;

  const hookLen = (hookData.length - 2) / 2;

  const sequence: Hex[] = new Array(27);

  sequence[0] = encodePacked(["uint8", "int256", "uint8"], [PUSH32, amountSpecified, amountSpecifiedSlot]);
  sequence[1] = encodePacked(
    [
      "uint8",
      "uint256",
      "uint8",
      "uint64",
      "uint8",
      "uint8",
      "uint8",
      "uint8",
      "uint8",
      "uint16",
      "bytes",
    ],
    [
      SWAP,
      poolId,
      amountSpecifiedSlot,
      limitOffsetted,
      zeroForOne,
      zeroSlot,
      successSlot,
      amount0Slot,
      amount1Slot,
      hookLen,
      hookData,
    ],
  );
  sequence[2] = encodePacked(["uint8", "uint16", "uint8"], [0, 0, 0]);
  sequence[3] = encodePacked(["uint8"], [REVERT]);
  sequence[4] = encodePacked(["uint8"], [JUMPDEST]);
  sequence[2] = encodePacked(
    ["uint8", "uint16", "uint8"],
    [JUMP, sumLens(sequence.slice(0, 4)), successSlot],
  );

  sequence[5] = encodePacked(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount0Slot, logicSlot]);
  sequence[6] = encodePacked(["uint8", "uint16", "uint8"], [0, 0, 0]);
  sequence[7] = encodePacked(["uint8", "uint8", "uint8"], [NEG, amount0Slot, amount0Slot]);
  sequence[8] = encodePacked(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token0, payer, amount0Slot, successSlotSettle0],
  );
  sequence[9] = encodePacked(["uint8"], [JUMPDEST]);
  sequence[6] = encodePacked(
    ["uint8", "uint16", "uint8"],
    [JUMP, sumLens(sequence.slice(0, 9)), logicSlot],
  );

  sequence[10] = encodePacked(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]);
  sequence[11] = encodePacked(["uint8", "uint16", "uint8"], [0, 0, 0]);
  sequence[12] = encodePacked(["uint8", "address"], [SYNC_TOKEN, token0]);
  sequence[13] = encodePacked(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token0, amount0Slot, nofeeswap, successSlotTransfer0, 0],
  );
  sequence[14] = encodePacked(
    ["uint8", "uint8", "uint8", "uint8"],
    [SETTLE, valueSlotSettle0, successSlotSettle0, resultSlotSettle0],
  );
  sequence[15] = encodePacked(["uint8"], [JUMPDEST]);
  sequence[11] = encodePacked(
    ["uint8", "uint16", "uint8"],
    [JUMP, sumLens(sequence.slice(0, 15)), logicSlot],
  );

  sequence[16] = encodePacked(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount1Slot, logicSlot]);
  sequence[17] = encodePacked(["uint8", "uint16", "uint8"], [0, 0, 0]);
  sequence[18] = encodePacked(["uint8", "uint8", "uint8"], [NEG, amount1Slot, amount1Slot]);
  sequence[19] = encodePacked(
    ["uint8", "address", "address", "uint8", "uint8"],
    [TAKE_TOKEN, token1, payer, amount1Slot, successSlotSettle1],
  );
  sequence[20] = encodePacked(["uint8"], [JUMPDEST]);
  sequence[17] = encodePacked(
    ["uint8", "uint16", "uint8"],
    [JUMP, sumLens(sequence.slice(0, 20)), logicSlot],
  );

  sequence[21] = encodePacked(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]);
  sequence[22] = encodePacked(["uint8", "uint16", "uint8"], [0, 0, 0]);
  sequence[23] = encodePacked(["uint8", "address"], [SYNC_TOKEN, token1]);
  sequence[24] = encodePacked(
    ["uint8", "address", "uint8", "address", "uint8", "uint8"],
    [TRANSFER_FROM_PAYER_ERC20, token1, amount1Slot, nofeeswap, successSlotTransfer1, 0],
  );
  sequence[25] = encodePacked(
    ["uint8", "uint8", "uint8", "uint8"],
    [SETTLE, valueSlotSettle1, successSlotSettle1, resultSlotSettle1],
  );
  sequence[26] = encodePacked(["uint8"], [JUMPDEST]);
  sequence[22] = encodePacked(
    ["uint8", "uint16", "uint8"],
    [JUMP, sumLens(sequence.slice(0, 26)), logicSlot],
  );

  return packUnlockPayload(deadline, sequence);
}
