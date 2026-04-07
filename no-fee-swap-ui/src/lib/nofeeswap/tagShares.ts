import { encodeAbiParameters, keccak256 } from "viem";

export function computeTagShares(poolId: bigint, qMin: bigint, qMax: bigint): bigint {
  const h = keccak256(
    encodeAbiParameters(
      [
        { name: "poolId", type: "uint256" },
        { name: "qMin", type: "int256" },
        { name: "qMax", type: "int256" },
      ],
      [poolId, qMin, qMax],
    ),
  );
  return BigInt(h);
}
