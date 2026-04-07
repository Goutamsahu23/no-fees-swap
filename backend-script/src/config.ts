import "dotenv/config";
import { type Address, type Hex } from "viem";

function envRequired(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const RPC_URL = envRequired("RPC_URL");
export const NOFEESWAP = envRequired("NOFEESWAP") as Address;
export const OPERATOR = envRequired("OPERATOR") as Address;
export const TOKEN0 = envRequired("TOKEN0") as Address;
export const TOKEN1 = envRequired("TOKEN1") as Address;
export const ATTACKER_PRIVATE_KEY = envRequired("ATTACKER_PRIVATE_KEY") as Hex;
export const MIN_PROFIT_WEI = BigInt(process.env.MIN_PROFIT_WEI ?? "0");
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "200");
