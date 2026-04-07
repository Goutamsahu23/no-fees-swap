/** Match operator/tests/SwapData_test.py */

export const LOG_PRICE_TICK_X59 = 57643193118714n;

export const FEE_SPACING_LARGE_X59 = 5793624167011548n;
export const LOG_PRICE_SPACING_LARGE_X59 = 200n * LOG_PRICE_TICK_X59;

export const X15 = 2n ** 15n;
export const X59 = 2n ** 59n;
export const X60 = 2n ** 60n;
export const X63 = 2n ** 63n;

export const DEADLINE_MAX = 2n ** 32n - 1n;

/** Default mock kernel from SwapData_test.py L841–846 */
export const DEFAULT_KERNEL: [bigint, bigint][] = [
  [0n, 0n],
  [LOG_PRICE_SPACING_LARGE_X59, 2n ** 15n],
];

/** Default sqrt price from SwapData_test.py */
export const DEFAULT_SQRT_PRICE_X96 = 67254909186229727392878661970n;

/** Precomputed curve [lower, upper, qCurrent] in X59 offset form (sympy, logOffset=0) */
export const DEFAULT_CURVE_X59: [bigint, bigint, bigint] = [
  9027385180251148208n,
  9038913818874891008n,
  9034475293004730350n,
];

export const DEFAULT_POOL_GROWTH_PORTION = (1n << 47n) / 5n;

/** unsaltedPoolId from SwapData_test (logOffset=0, hook=0, flags=0) */
export const DEFAULT_UNSALTED_POOL_ID =
  (1n << 188n) + (0n << 180n) + (0n << 160n) + 0n;
