/** Rough helpers for UI copy — not on-chain quotes */

export function logPriceFromSqrtX96(sqrtPriceX96: bigint): bigint {
  const r = Number(sqrtPriceX96) / Number(2n ** 96n);
  if (r <= 0 || !Number.isFinite(r)) return 0n;
  return BigInt(Math.floor(Number(2n ** 60n) * Math.log(r)));
}

/** Apply slippage to sqrt price then map to log limit (tighter limit = worse price for trader) */
export function logLimitFromSlippage(
  sqrtPriceX96: bigint,
  slippageBps: number,
  tighten: "tighter_up" | "tighter_down",
): bigint {
  const slip = Math.min(Math.max(slippageBps, 1), 5000) / 10000;
  const s = Number(sqrtPriceX96);
  const f = tighten === "tighter_down" ? 1 - slip : 1 + slip;
  const lim = BigInt(Math.max(1, Math.floor(s * f)));
  return logPriceFromSqrtX96(lim);
}

export function formatAmount(n: bigint, decimals: number, maxFrac = 6): string {
  if (decimals === 0) return n.toString();
  const neg = n < 0n;
  const v = neg ? -n : n;
  const base = 10n ** BigInt(decimals);
  const ip = v / base;
  const fp = v % base;
  const fs = fp.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const s = fs ? `${ip}.${fs}` : `${ip}`;
  return neg ? `-${s}` : s;
}
