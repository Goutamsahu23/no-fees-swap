import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected, metaMask } from "wagmi/connectors";

const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");

export const localhost31337 = defineChain({
  id,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});

export const wagmiConfig = createConfig({
  chains: [localhost31337],
  connectors: [injected(), metaMask()],
  transports: { [localhost31337.id]: http(rpc) },
});
