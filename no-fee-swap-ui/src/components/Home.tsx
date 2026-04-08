"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { injected } from "wagmi/connectors";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  isAddress,
  maxUint256,
  parseUnits,
} from "viem";
import { localhost31337 } from "@/lib/wagmi";
import { delegateeAbi, erc20Abi, nofeeswapAbi } from "@/lib/abis";
import {
  DEFAULT_CURVE_X59,
  DEFAULT_POOL_GROWTH_PORTION,
  DEFAULT_SQRT_PRICE_X96,
  DEFAULT_UNSALTED_POOL_ID,
  LOG_PRICE_SPACING_LARGE_X59,
  LOG_PRICE_TICK_X59,
  X15,
  DEADLINE_MAX,
} from "@/lib/nofeeswap/constants";
import {
  encodeCurve,
  encodeKernelCompact,
  getPoolId,
  sortTokenPair,
  curveFromSqrtPriceX96,
} from "@/lib/nofeeswap/poolMath";
import { mintSequence, burnSequence, swapSequence } from "@/lib/nofeeswap/sequences";
import { computeTagShares } from "@/lib/nofeeswap/tagShares";
import { formatAmount, logLimitFromSlippage, logPriceFromSqrtX96 } from "@/lib/nofeeswap/swapMath";
import { KernelViz } from "./KernelViz";

const LS_POOL = "nofeeswap-ui-pool-v1";

type PoolSnap = {
  poolId: string;
  sqrtPriceX96: string;
  curve: string[];
  unsaltedPoolId: string;
};

type ActionKind = "init" | "approve0" | "approve1" | "mint" | "burn" | "swap";

type ActivityModalProps = {
  variant: "success" | "error" | "info";
  title: string;
  lines: string[];
  onDismiss: () => void;
};

type BannerState = Pick<ActivityModalProps, "variant" | "title" | "lines">;

function ActivityModal({ variant, title, lines, onDismiss }: ActivityModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const accentBorder =
    variant === "success"
      ? "border-emerald-600/60"
      : variant === "error"
        ? "border-red-600/60"
        : "border-sky-600/60";
  const titleColor =
    variant === "success"
      ? "text-emerald-300"
      : variant === "error"
        ? "text-red-300"
        : "text-sky-200";
  const iconBg =
    variant === "success"
      ? "bg-emerald-500/15 text-emerald-400"
      : variant === "error"
        ? "bg-red-500/15 text-red-400"
        : "bg-sky-500/15 text-sky-400";

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
        className={`relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border bg-zinc-900 shadow-2xl shadow-black/50 ${accentBorder}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${iconBg}`}
              aria-hidden
            >
              {variant === "success" ? "✓" : variant === "error" ? "!" : "i"}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="activity-modal-title" className={`text-lg font-semibold ${titleColor}`}>
                {title}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">Press Escape or click outside to close.</p>
            </div>
          </div>
        </div>
        <div className="max-h-[min(50vh,24rem)] overflow-y-auto px-5 py-4 sm:px-6">
          <ul className="list-inside list-disc space-y-2 text-sm text-zinc-300">
            {lines.map((line, i) => (
              <li key={i} className="font-mono text-xs break-all sm:text-sm">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 bg-zinc-950/80 px-5 py-4 sm:px-6">
          <button
            ref={closeRef}
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function deltaLine(
  label: string,
  before: bigint | undefined,
  after: bigint | undefined,
  decimals: number,
): string | null {
  if (before === undefined || after === undefined) return null;
  if (before === after) return `${label}: unchanged (${formatAmount(after, decimals)})`;
  return `${label}: ${formatAmount(before, decimals)} → ${formatAmount(after, decimals)}`;
}

function TxLine({
  label,
  hash,
  isPending,
  isConfirming,
  receiptSuccess,
  receiptReverted,
  isError,
  error,
}: {
  label: string;
  hash?: Hex;
  isPending: boolean;
  isConfirming: boolean;
  receiptSuccess: boolean;
  receiptReverted: boolean;
  isError: boolean;
  error: Error | null;
}) {
  let status = "Idle";
  if (isPending) status = "Waiting for wallet…";
  else if (isConfirming && !receiptSuccess && !receiptReverted)
    status = "Confirming on-chain…";
  else if (receiptReverted) status = "Reverted on-chain";
  else if (receiptSuccess) status = "Confirmed";
  else if (isError) status = "Rejected or failed to send";

  return (
    <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 text-sm">
      <div className="font-medium text-zinc-200">{label}</div>
      <div className="text-zinc-400">{status}</div>
      {hash && (
        <div className="mt-1 truncate font-mono text-xs text-zinc-500">{hash}</div>
      )}
      {isError && error && (
        <div className="mt-2 text-xs text-red-400">{error.message}</div>
      )}
    </div>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [nofeeswap, setNofeeswap] = useState("");
  const [delegatee, setDelegatee] = useState("");
  const [operator, setOperator] = useState("");
  const [tokenA, setTokenA] = useState("");
  const [tokenB, setTokenB] = useState("");

  const [unsaltedPoolId, setUnsaltedPoolId] = useState(DEFAULT_UNSALTED_POOL_ID.toString());
  const [poolGrowth, setPoolGrowth] = useState(DEFAULT_POOL_GROWTH_PORTION.toString());
  const [sqrtInput, setSqrtInput] = useState(DEFAULT_SQRT_PRICE_X96.toString());
  const [kneeB, setKneeB] = useState((LOG_PRICE_SPACING_LARGE_X59 / 2n).toString());
  const [kneeC, setKneeC] = useState((2n ** 15n).toString());

  const [poolSnap, setPoolSnap] = useState<PoolSnap | null>(null);
  const [pendingPoolSave, setPendingPoolSave] = useState(false);

  const [tickLo, setTickLo] = useState("-4000");
  const [tickHi, setTickHi] = useState("-2000");
  const [mintShares, setMintShares] = useState("1000000000000000000");
  const [burnShares, setBurnShares] = useState("1000000000000000000");

  const [swapAmount, setSwapAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState(50);
  const [zeroForOne, setZeroForOne] = useState(2);

  const [banner, setBanner] = useState<BannerState | null>(null);
  const pendingActionRef = useRef<ActionKind | null>(null);
  const balanceSnapshotRef = useRef<{ b0?: bigint; b1?: bigint }>({});
  const txGenerationRef = useRef(0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setNofeeswap(process.env.NEXT_PUBLIC_NOFEESWAP ?? "");
    setDelegatee(process.env.NEXT_PUBLIC_NOFEESWAP_DELEGATEE ?? "");
    setOperator(process.env.NEXT_PUBLIC_OPERATOR ?? "");
    setTokenA(process.env.NEXT_PUBLIC_TOKEN0 ?? "");
    setTokenB(process.env.NEXT_PUBLIC_TOKEN1 ?? "");
    try {
      const raw = localStorage.getItem(LS_POOL);
      if (raw) setPoolSnap(JSON.parse(raw) as PoolSnap);
    } catch {
      /* ignore */
    }
  }, []);

  const sorted = useMemo(() => {
    if (!isAddress(tokenA) || !isAddress(tokenB)) return null;
    return sortTokenPair(tokenA, tokenB);
  }, [tokenA, tokenB]);

  const kernel = useMemo(() => {
    const q = LOG_PRICE_SPACING_LARGE_X59;
    const b = BigInt(kneeB || "0");
    const c = BigInt(kneeC || "0");
    return [
      [0n, 0n] as [bigint, bigint],
      [b, c],
      [q, X15],
    ];
  }, [kneeB, kneeC]);

  const curvePts = useMemo(() => {
    try {
      const s = BigInt(sqrtInput || "0");
      return curveFromSqrtPriceX96(s, LOG_PRICE_SPACING_LARGE_X59, 0);
    } catch {
      return DEFAULT_CURVE_X59;
    }
  }, [sqrtInput]);

  const kernelVizPoints = useMemo(
    () => kernel.map(([b, c]) => ({ b, c })),
    [kernel],
  );

  const poolIdBig = useMemo(() => {
    if (!poolSnap?.poolId) return 0n;
    try {
      return BigInt(poolSnap.poolId);
    } catch {
      return 0n;
    }
  }, [poolSnap]);

  const sqrtActive = useMemo(() => {
    if (poolSnap?.sqrtPriceX96) {
      try {
        return BigInt(poolSnap.sqrtPriceX96);
      } catch {
        /* fallthrough */
      }
    }
    return DEFAULT_SQRT_PRICE_X96;
  }, [poolSnap]);

  const currentLog = useMemo(() => logPriceFromSqrtX96(sqrtActive), [sqrtActive]);

  const swapLimit = useMemo(() => {
    const tighten = zeroForOne === 2 ? "tighter_down" : "tighter_up";
    return logLimitFromSlippage(sqrtActive, slippageBps, tighten);
  }, [sqrtActive, slippageBps, zeroForOne]);

  const { data: dec0 } = useReadContract({
    address: sorted?.token0,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(sorted?.token0) },
  });
  const { data: dec1 } = useReadContract({
    address: sorted?.token1,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(sorted?.token1) },
  });
  const d0 = typeof dec0 === "number" ? dec0 : 18;
  const d1 = typeof dec1 === "number" ? dec1 : 18;

  const { data: bal0, refetch: refetchBal0 } = useReadContract({
    address: sorted?.token0,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(sorted?.token0 && address) },
  });
  const { data: bal1, refetch: refetchBal1 } = useReadContract({
    address: sorted?.token1,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(sorted?.token1 && address) },
  });

  const { data: symbol0 } = useReadContract({
    address: sorted?.token0,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: Boolean(sorted?.token0) },
  });
  const { data: symbol1 } = useReadContract({
    address: sorted?.token1,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: Boolean(sorted?.token1) },
  });
  const sym0Label = typeof symbol0 === "string" ? symbol0 : "token0";
  const sym1Label = typeof symbol1 === "string" ? symbol1 : "token1";

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeErr,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isError: isReceiptError,
    error: receiptErr,
  } = useWaitForTransactionReceipt({ hash, query: { enabled: Boolean(hash) } });

  const receiptSuccess = receipt?.status === "success";
  const receiptReverted = receipt?.status === "reverted";

  const startTx = useCallback(
    (kind: ActionKind) => {
      setBanner(null);
      txGenerationRef.current += 1;
      pendingActionRef.current = kind;
      balanceSnapshotRef.current = {
        b0: typeof bal0 === "bigint" ? bal0 : undefined,
        b1: typeof bal1 === "bigint" ? bal1 : undefined,
      };
    },
    [bal0, bal1],
  );

  useEffect(() => {
    if (!writeErr) return;
    const msg =
      "shortMessage" in writeErr && typeof writeErr.shortMessage === "string"
        ? writeErr.shortMessage
        : writeErr.message;
    setBanner({
      variant: "error",
      title: "Transaction did not send",
      lines: [msg],
    });
    pendingActionRef.current = null;
    setPendingPoolSave(false);
  }, [writeErr]);

  useEffect(() => {
    if (!receipt || receipt.status !== "reverted") return;
    setBanner({
      variant: "error",
      title: "Transaction reverted on-chain",
      lines: [
        "The transaction was mined but execution reverted. Check pool state, ticks, approvals, and amounts.",
        ...(hash ? [`tx: ${hash}`] : []),
      ],
    });
    pendingActionRef.current = null;
    setPendingPoolSave(false);
    resetWrite();
  }, [receipt, hash, resetWrite]);

  const sendInit = useCallback(() => {
    if (!address || !isAddress(nofeeswap) || !isAddress(delegatee) || !sorted) return;
    const tag0 = sorted.tag0;
    const tag1 = sorted.tag1;
    const kernelCompact = encodeKernelCompact(kernel as [bigint, bigint][]);
    const curveEnc = encodeCurve([...curvePts]);
    const hookData = "0x" as Hex;
    const up = BigInt(unsaltedPoolId);
    const pg = BigInt(poolGrowth);

    const inner = encodeFunctionData({
      abi: delegateeAbi,
      functionName: "initialize",
      args: [up, tag0, tag1, pg, kernelCompact, curveEnc, hookData],
    });

    startTx("init");
    setPendingPoolSave(true);
    writeContract({
      address: nofeeswap,
      abi: nofeeswapAbi,
      functionName: "dispatch",
      args: [inner as Hex],
    });
  }, [
    address,
    nofeeswap,
    delegatee,
    sorted,
    kernel,
    curvePts,
    unsaltedPoolId,
    poolGrowth,
    writeContract,
    startTx,
  ]);

  useEffect(() => {
    if (!receipt || receipt.status !== "success" || !pendingPoolSave || !address || !sorted) return;

    pendingActionRef.current = null;

    const up = BigInt(unsaltedPoolId);
    const pid = getPoolId(address, up);
    const snap: PoolSnap = {
      poolId: pid.toString(),
      sqrtPriceX96: sqrtInput,
      curve: curvePts.map((x) => x.toString()),
      unsaltedPoolId: up.toString(),
    };
    localStorage.setItem(LS_POOL, JSON.stringify(snap));
    setPoolSnap(snap);
    setPendingPoolSave(false);

    const snapBal = { ...balanceSnapshotRef.current };
    const txHash = hash;

    // Show success immediately; balance deltas require refetch (extra RPC round-trips).
    const quickLines: string[] = [
      `poolId (salted): ${pid.toString()}`,
      `unsaltedPoolId: ${up.toString()}`,
      "Pool state saved in this browser for mint / burn / swap.",
      "Refreshing token balances…",
    ];
    if (txHash) quickLines.push(`tx: ${txHash}`);
    setBanner({ variant: "success", title: "Pool initialized", lines: quickLines });

    void (async () => {
      const gen = txGenerationRef.current;
      const [r0, r1] = await Promise.all([refetchBal0(), refetchBal1()]);
      if (txGenerationRef.current !== gen) return;
      const n0 = (r0.data ?? undefined) as bigint | undefined;
      const n1 = (r1.data ?? undefined) as bigint | undefined;
      const lines: string[] = [
        `poolId (salted): ${pid.toString()}`,
        `unsaltedPoolId: ${up.toString()}`,
        "Pool state saved in this browser for mint / burn / swap.",
      ];
      const t0 = deltaLine(sym0Label, snapBal.b0, n0, d0);
      const t1 = deltaLine(sym1Label, snapBal.b1, n1, d1);
      if (t0) lines.push(t0);
      if (t1) lines.push(t1);
      if (txHash) lines.push(`tx: ${txHash}`);
      setBanner({ variant: "success", title: "Pool initialized", lines });
    })();

    resetWrite();
  }, [
    receipt,
    pendingPoolSave,
    address,
    sorted,
    unsaltedPoolId,
    sqrtInput,
    curvePts,
    resetWrite,
    refetchBal0,
    refetchBal1,
    sym0Label,
    sym1Label,
    d0,
    d1,
    hash,
  ]);

  useEffect(() => {
    if (!receipt || receipt.status !== "success" || pendingPoolSave) return;

    const action = pendingActionRef.current;
    if (!action || action === "init") return;

    pendingActionRef.current = null;
    const snapBal = { ...balanceSnapshotRef.current };

    const titles: Record<Exclude<ActionKind, "init">, string> = {
      approve0: `${sym0Label} (token0) approved`,
      approve1: `${sym1Label} (token1) approved`,
      mint: "Liquidity minted",
      burn: "Liquidity burned",
      swap: "Swap executed",
    };

    const title = titles[action];
    const txHash = hash;

    const quickLines: string[] = [];
    if (action === "approve0") {
      quickLines.push(`Operator can spend ${sym0Label} up to max allowance.`);
    } else if (action === "approve1") {
      quickLines.push(`Operator can spend ${sym1Label} up to max allowance.`);
    } else if (action === "mint") {
      quickLines.push("Liquidity added for the tick range you specified.");
    } else if (action === "burn") {
      quickLines.push("Liquidity removed for the tick range you specified.");
    } else if (action === "swap") {
      quickLines.push("Swap completed through the operator unlock path.");
    }
    quickLines.push("Refreshing token balances…");
    if (txHash) quickLines.push(`tx: ${txHash}`);
    setBanner({ variant: "success", title, lines: quickLines });
    resetWrite();

    void (async () => {
      const gen = txGenerationRef.current;
      const [r0, r1] = await Promise.all([refetchBal0(), refetchBal1()]);
      if (txGenerationRef.current !== gen) return;
      const n0 = (r0.data ?? undefined) as bigint | undefined;
      const n1 = (r1.data ?? undefined) as bigint | undefined;
      const lines: string[] = [];

      if (action === "approve0") {
        lines.push(`Operator can spend ${sym0Label} up to max allowance.`);
      } else if (action === "approve1") {
        lines.push(`Operator can spend ${sym1Label} up to max allowance.`);
      } else if (action === "mint") {
        lines.push("Liquidity added for the tick range you specified.");
      } else if (action === "burn") {
        lines.push("Liquidity removed for the tick range you specified.");
      } else if (action === "swap") {
        lines.push("Swap completed through the operator unlock path.");
      }

      const t0 = deltaLine(sym0Label, snapBal.b0, n0, d0);
      const t1 = deltaLine(sym1Label, snapBal.b1, n1, d1);
      if (t0) lines.push(t0);
      if (t1) lines.push(t1);
      if (txHash) lines.push(`tx: ${txHash}`);

      setBanner({
        variant: "success",
        title,
        lines,
      });
    })();
  }, [
    receipt,
    pendingPoolSave,
    refetchBal0,
    refetchBal1,
    sym0Label,
    sym1Label,
    d0,
    d1,
    hash,
    resetWrite,
  ]);

  const sendApprove = useCallback(() => {
    if (!operator || !sorted || !isAddress(operator)) return;
    startTx("approve0");
    writeContract({
      address: sorted.token0,
      abi: erc20Abi,
      functionName: "approve",
      args: [operator, maxUint256],
    });
    // second token: user clicks twice or we batch - use separate tx for token1
  }, [operator, sorted, writeContract, startTx]);

  const sendApprove1 = useCallback(() => {
    if (!operator || !sorted || !isAddress(operator)) return;
    startTx("approve1");
    writeContract({
      address: sorted.token1,
      abi: erc20Abi,
      functionName: "approve",
      args: [operator, maxUint256],
    });
  }, [operator, sorted, writeContract, startTx]);

  const sendMint = useCallback(() => {
    if (!address || !sorted || !isAddress(nofeeswap) || !isAddress(operator) || !poolIdBig) return;
    const qMin = BigInt(tickLo) * LOG_PRICE_TICK_X59;
    const qMax = BigInt(tickHi) * LOG_PRICE_TICK_X59;
    const shares = BigInt(mintShares);
    const tag = computeTagShares(poolIdBig, qMin, qMax);
    const hookData = "0x" as Hex;
    const data = mintSequence(
      nofeeswap,
      sorted.token0,
      sorted.token1,
      tag,
      poolIdBig,
      qMin,
      qMax,
      shares,
      hookData,
      Number(DEADLINE_MAX & 0xffffffffn),
    );
    startTx("mint");
    writeContract({
      address: nofeeswap,
      abi: nofeeswapAbi,
      functionName: "unlock",
      args: [operator, data],
    });
  }, [
    address,
    sorted,
    nofeeswap,
    operator,
    poolIdBig,
    tickLo,
    tickHi,
    mintShares,
    writeContract,
    startTx,
  ]);

  const sendBurn = useCallback(() => {
    if (!address || !sorted || !isAddress(nofeeswap) || !isAddress(operator) || !poolIdBig) return;
    const qMin = BigInt(tickLo) * LOG_PRICE_TICK_X59;
    const qMax = BigInt(tickHi) * LOG_PRICE_TICK_X59;
    const shares = BigInt(burnShares);
    const tag = computeTagShares(poolIdBig, qMin, qMax);
    const hookData = "0x" as Hex;
    const data = burnSequence(
      sorted.token0,
      sorted.token1,
      address,
      tag,
      poolIdBig,
      qMin,
      qMax,
      shares,
      hookData,
      Number(DEADLINE_MAX & 0xffffffffn),
    );
    startTx("burn");
    writeContract({
      address: nofeeswap,
      abi: nofeeswapAbi,
      functionName: "unlock",
      args: [operator, data],
    });
  }, [
    address,
    sorted,
    nofeeswap,
    operator,
    poolIdBig,
    tickLo,
    tickHi,
    burnShares,
    writeContract,
    startTx,
  ]);

  const sendSwap = useCallback(() => {
    if (!address || !sorted || !isAddress(nofeeswap) || !isAddress(operator) || !poolIdBig) return;
    let amt: bigint;
    try {
      amt = parseUnits(swapAmount || "0", d0);
    } catch {
      setBanner({
        variant: "error",
        title: "Invalid swap amount",
        lines: ["Enter a valid number for the amount (token0 decimals)."],
      });
      return;
    }
    const amountSpecified = -amt;
    const hookData = "0x" as Hex;
    const data = swapSequence(
      nofeeswap,
      sorted.token0,
      sorted.token1,
      address,
      poolIdBig,
      amountSpecified,
      swapLimit,
      zeroForOne,
      hookData,
      Number(DEADLINE_MAX & 0xffffffffn),
    );
    startTx("swap");
    writeContract({
      address: nofeeswap,
      abi: nofeeswapAbi,
      functionName: "unlock",
      args: [operator, data],
    });
  }, [
    address,
    sorted,
    nofeeswap,
    operator,
    poolIdBig,
    swapAmount,
    d0,
    swapLimit,
    zeroForOne,
    writeContract,
    startTx,
  ]);

  const wrongChain = chainId !== localhost31337.id;

  const progressMsg = useMemo(() => {
    if (isPending) return "Open your wallet and confirm the transaction.";
    if (hash && isConfirming && !receiptSuccess && !receiptReverted)
      return "Transaction sent — waiting for block confirmation…";
    return null;
  }, [isPending, hash, isConfirming, receiptSuccess, receiptReverted]);

  const estOut = useMemo(() => {
    try {
      const a = parseUnits(swapAmount || "0", d0);
      const sqrt = sqrtActive;
      const p = Number(sqrt * sqrt) / Number(2n ** 192n);
      const out = Number(a) * p;
      if (!Number.isFinite(out)) return "—";
      return out.toPrecision(6);
    } catch {
      return "—";
    }
  }, [swapAmount, d0, sqrtActive]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">NoFeeSwap UI</h1>
          <p className="text-sm text-zinc-400">Local Anvil · MetaMask</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!mounted ? (
            <div
              className="h-10 w-44 animate-pulse rounded-lg bg-zinc-800"
              aria-hidden
            />
          ) : isConnected ? (
            <>
              <span className="max-w-[200px] truncate rounded-lg bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300">
                {address}
              </span>
              {wrongChain && (
                <button
                  type="button"
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white"
                  onClick={() => switchChain?.({ chainId: localhost31337.id })}
                >
                  Switch to local chain
                </button>
              )}
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300"
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => connect({ connector: injected() })}
            >
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      {progressMsg && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-sky-800 bg-sky-950/40 px-4 py-3 text-sm text-sky-200"
        >
          {progressMsg}
        </div>
      )}

      {banner && (
        <ActivityModal
          variant={banner.variant}
          title={banner.title}
          lines={banner.lines}
          onDismiss={() => setBanner(null)}
        />
      )}

      <section className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="text-lg font-medium text-zinc-100">Contracts</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Paste addresses from <code className="text-zinc-400">core/deployments</code> and{" "}
          <code className="text-zinc-400">operator/deployments</code>, or set{" "}
          <code className="text-zinc-400">NEXT_PUBLIC_*</code> in <code>.env.local</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["Nofeeswap", nofeeswap, setNofeeswap],
              ["Delegatee", delegatee, setDelegatee],
              ["Operator", operator, setOperator],
              ["Token A", tokenA, setTokenA],
              ["Token B", tokenB, setTokenB],
            ] as const
          ).map(([label, val, set]) => (
            <label key={label} className="block text-sm">
              <span className="text-zinc-400">{label}</span>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
        {sorted && (
          <p className="mt-3 text-xs text-zinc-500">
            tag0 &lt; tag1:{" "}
            <span className="font-mono text-zinc-400">{sorted.token0}</span> ·{" "}
            <span className="font-mono text-zinc-400">{sorted.token1}</span>
          </p>
        )}
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="mb-2 text-lg font-medium text-zinc-100">2b · Initialize pool</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Dispatches <code className="text-zinc-400">delegatee.initialize</code> via{" "}
          <code className="text-zinc-400">nofeeswap.dispatch</code>. Pool owner = connected wallet
          (salted pool id).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-400">unsaltedPoolId (uint256)</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={unsaltedPoolId}
              onChange={(e) => setUnsaltedPoolId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">poolGrowthPortion (X47)</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={poolGrowth}
              onChange={(e) => setPoolGrowth(e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">Initial sqrtPriceX96</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={sqrtInput}
              onChange={(e) => setSqrtInput(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-6">
          <KernelViz points={kernelVizPoints} qSpacing={LOG_PRICE_SPACING_LARGE_X59} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-zinc-400">Interior breakpoint b (X59, &lt; qSpacing)</span>
              <input
                type="range"
                min={1}
                max={Number(LOG_PRICE_SPACING_LARGE_X59 - 1n)}
                value={Number(kneeB)}
                onChange={(e) => setKneeB(e.target.value)}
                className="mt-2 w-full"
              />
              <div className="font-mono text-xs text-zinc-500">{kneeB}</div>
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Interior intensity c (≤ 2¹⁵)</span>
              <input
                type="range"
                min={0}
                max={Number(X15)}
                value={Number(kneeC)}
                onChange={(e) => setKneeC(e.target.value)}
                className="mt-2 w-full"
              />
              <div className="font-mono text-xs text-zinc-500">{kneeC}</div>
            </label>
          </div>
        </div>

        <button
          type="button"
          disabled={!isConnected || wrongChain || !sorted}
          className="mt-6 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          onClick={() => sendInit()}
        >
          Initialize pool (MetaMask)
        </button>
        <TxLine
          label="Last transaction"
          hash={hash}
          isPending={isPending}
          isConfirming={isConfirming}
          receiptSuccess={receiptSuccess}
          receiptReverted={receiptReverted}
          isError={Boolean(writeErr) || isReceiptError}
          error={(writeErr ?? receiptErr) as Error | null}
        />
        {poolSnap && (
          <p className="mt-4 text-xs text-zinc-400">
            Saved poolId: <span className="font-mono text-emerald-400">{poolSnap.poolId}</span>
          </p>
        )}
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="mb-2 text-lg font-medium text-zinc-100">2c · Liquidity (mint / burn)</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Uses operator unlock bytecode (SwapData_test-style). Approve the operator for both tokens
          first.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white"
            onClick={() => sendApprove()}
          >
            Approve token0 → operator
          </button>
          <button
            type="button"
            className="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white"
            onClick={() => sendApprove1()}
          >
            Approve token1 → operator
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-zinc-400">Tick lower</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={tickLo}
              onChange={(e) => setTickLo(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Tick upper</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={tickHi}
              onChange={(e) => setTickHi(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Shares (raw uint)</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={mintShares}
              onChange={(e) => setMintShares(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-400">Burn shares</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
              value={burnShares}
              onChange={(e) => setBurnShares(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isConnected || wrongChain || !poolIdBig}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={() => sendMint()}
          >
            Mint liquidity
          </button>
          <button
            type="button"
            disabled={!isConnected || wrongChain || !poolIdBig}
            className="rounded-lg bg-orange-800 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={() => sendBurn()}
          >
            Burn liquidity
          </button>
        </div>
        <div className="mt-4 text-sm text-zinc-400">
          Balances:{" "}
          <span className="font-mono text-zinc-300">
            {bal0 !== undefined ? formatAmount(bal0 as bigint, d0) : "—"}
          </span>{" "}
          /{" "}
          <span className="font-mono text-zinc-300">
            {bal1 !== undefined ? formatAmount(bal1 as bigint, d1) : "—"}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h2 className="mb-2 text-lg font-medium text-zinc-100">2d · Swap</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Exact-input style amount (token0 decimals) with protocol{" "}
          <code className="text-zinc-400">zeroForOne</code> selector (default 2 per tests). Slippage
          tightens the log-price limit vs the saved pool spot.
        </p>
        <label className="text-sm">
          <span className="text-zinc-400">Amount in (token0, human)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
            value={swapAmount}
            onChange={(e) => setSwapAmount(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-zinc-400">Slippage tolerance (bps)</span>
          <input
            type="range"
            min={1}
            max={200}
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="text-xs text-zinc-500">{slippageBps} bps</div>
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-zinc-400">zeroForOne (uint256)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs"
            value={zeroForOne}
            onChange={(e) => setZeroForOne(Number(e.target.value))}
          />
        </label>
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          <div>
            Current log (approx):{" "}
            <span className="font-mono text-emerald-400">{currentLog.toString()}</span>
          </div>
          <div>
            Limit after slippage band:{" "}
            <span className="font-mono text-emerald-400">{swapLimit.toString()}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Est. output (rough spot, not a protocol quote):{" "}
            <span className="font-mono text-zinc-300">{estOut}</span> (token1 units, ~)
          </div>
          <div className="text-xs text-zinc-500">
            Implied max adverse move vs spot: ~{slippageBps / 100}% (via sqrt-price band)
          </div>
        </div>
        <button
          type="button"
          disabled={!isConnected || wrongChain || !poolIdBig}
          className="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          onClick={() => sendSwap()}
        >
          Swap via operator
        </button>
      </section>
    </div>
  );
}
