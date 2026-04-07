import { type Address, encodePacked, keccak256 } from "viem";
import { X63, X60 } from "./constants";

export function twosComplementInt8(value: number): number {
  return value >= 0 ? value : 256 + value;
}

export function encodeKernelCompact(kernel: [bigint, bigint][]): bigint[] {
  let k = 0n;
  let i = 0;
  for (const point of kernel.slice(1)) {
    k <<= 16n;
    k += point[1];
    k <<= 64n;
    k += point[0];
    i += 80;
  }
  if (i % 256 !== 0) {
    k <<= BigInt(256 - (i % 256));
    i += 256 - (i % 256);
  }
  const l = i / 256;
  const out: bigint[] = [];
  let kk = k;
  for (let j = 0; j < l; j++) {
    out.unshift(kk & ((1n << 256n) - 1n));
    kk >>= 256n;
  }
  return out;
}

export function encodeCurve(curve: bigint[]): bigint[] {
  const encodedCurve = new Array<bigint>(Math.ceil((curve.length + 3) / 4)).fill(0n);
  let shift = 192;
  let index = 0;
  for (const point of curve) {
    encodedCurve[Math.floor(index / 4)] += point << BigInt(shift);
    shift -= 64;
    shift = ((shift % 256) + 256) % 256;
    index += 1;
  }
  return encodedCurve;
}

export function getPoolId(sender: Address, unsaltedPoolId: bigint): bigint {
  const hash = keccak256(
    encodePacked(["address", "uint256"], [sender, unsaltedPoolId]),
  );
  const h = BigInt(hash);
  const shifted = (h << 188n) & ((1n << 256n) - 1n);
  return (unsaltedPoolId + shifted) % (1n << 256n);
}

export function addressToTag(addr: Address): bigint {
  return BigInt(addr);
}

export function sortTokenPair(
  a: Address,
  b: Address,
): { tag0: bigint; tag1: bigint; token0: Address; token1: Address } {
  const ta = addressToTag(a);
  const tb = addressToTag(b);
  if (ta < tb) return { tag0: ta, tag1: tb, token0: a, token1: b };
  return { tag0: tb, tag1: ta, token0: b, token1: a };
}

/** Approximate curve from sqrtPriceX96 (browser Number math); for custom prices */
function posMod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

export function curveFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  logPriceSpacing: bigint,
  logOffset = 0,
): [bigint, bigint, bigint] {
  const ratio = Number(sqrtPriceX96) / Number(2n ** 96n);
  const logPrice = BigInt(Math.floor(Number(X60) * Math.log(ratio)));
  const logPriceOffsetted = logPrice - BigInt(logOffset) + X63;
  const spacing = logPriceSpacing;
  const rem = posMod(logPrice, spacing);
  const lower = logPrice - rem - BigInt(logOffset) + X63;
  const upper = lower + spacing;
  return [lower, upper, logPriceOffsetted];
}

export function poolLogOffsetFromPoolId(poolId: bigint): number {
  let v = Number((poolId >> 180n) & 0xffn);
  if (v >= 128) v -= 256;
  return v;
}

export function offsetBoundsForModify(
  poolId: bigint,
  qMin: bigint,
  qMax: bigint,
): { lower: bigint; upper: bigint } {
  const logOffset = poolLogOffsetFromPoolId(poolId);
  const off = BigInt(logOffset) * (1n << 59n);
  return {
    lower: qMin + X63 - off,
    upper: qMax + X63 - off,
  };
}
