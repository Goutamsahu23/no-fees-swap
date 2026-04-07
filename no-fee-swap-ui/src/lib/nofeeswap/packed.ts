import { type Hex, concatHex, numberToHex, pad, size } from "viem";

/** Mirrors eth_abi.packed.encode_packed for the shapes used in Nofee.py sequences */
export function encodePacked(types: string[], values: unknown[]): Hex {
  const hexParts: Hex[] = [];
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const v = values[i];
    if (t === "uint8")
      hexParts.push(pad(numberToHex((v as number) & 0xff, { size: 1 }), { size: 1 }) as Hex);
    else if (t === "uint16")
      hexParts.push(pad(numberToHex((v as number) & 0xffff, { size: 2 }), { size: 2 }) as Hex);
    else if (t === "uint32")
      hexParts.push(pad(numberToHex(BigInt(v as number), { size: 4 }), { size: 4 }) as Hex);
    else if (t === "uint64")
      hexParts.push(
        pad(numberToHex(BigInt(v as string | number | bigint) & ((1n << 64n) - 1n), { size: 8 }), {
          size: 8,
        }) as Hex,
      );
    else if (t === "uint256")
      hexParts.push(
        pad(numberToHex(BigInt(v as string | number | bigint) & ((1n << 256n) - 1n), { size: 32 }), {
          size: 32,
        }) as Hex,
      );
    else if (t === "int256") {
      const mod = 1n << 256n;
      let x = BigInt(v as string | number | bigint) % mod;
      if (x < 0n) x += mod;
      hexParts.push(pad(numberToHex(x, { size: 32 }), { size: 32 }) as Hex);
    } else if (t === "address") hexParts.push(pad(v as `0x${string}`, { size: 20 }) as Hex);
    else if (t === "bytes") {
      const hx = (v as Hex) || "0x";
      hexParts.push(hx === "0x" ? "0x" : (hx as Hex));
    } else throw new Error(`unsupported packed type: ${t}`);
  }
  return concatHex(hexParts);
}

export function sumLens(hexParts: Hex[]): number {
  let s = 0;
  for (const h of hexParts) {
    s += size(h);
  }
  return s;
}
