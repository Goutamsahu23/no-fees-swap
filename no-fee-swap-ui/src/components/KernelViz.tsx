"use client";

import { X15 } from "@/lib/nofeeswap/constants";

type Point = { b: bigint; c: bigint };

export function KernelViz({
  points,
  qSpacing,
}: {
  points: Point[];
  qSpacing: bigint;
}) {
  const w = 300;
  const h = 160;
  const pad = 24;
  const q = Number(qSpacing) || 1;
  const toX = (b: bigint) => pad + (Number(b) / q) * (w - 2 * pad);
  const toY = (c: bigint) =>
    h - pad - (Number(c) / Number(X15)) * (h - 2 * pad);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.b).toFixed(1)} ${toY(p.c).toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
      <p className="mb-2 text-sm font-medium text-zinc-300">Kernel k(h) preview</p>
      <p className="mb-3 text-xs text-zinc-500">
        Horizontal: X59 spacing (0 → qSpacing). Vertical: intensity (0 → 2¹⁵).
      </p>
      <svg width={w} height={h} className="mx-auto text-emerald-400">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#3f3f46" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#3f3f46" strokeWidth="1" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.b)}
            cy={toY(p.c)}
            r={4}
            fill="#34d399"
            className={i > 0 && i < points.length - 1 ? "cursor-pointer" : ""}
          />
        ))}
      </svg>
    </div>
  );
}
