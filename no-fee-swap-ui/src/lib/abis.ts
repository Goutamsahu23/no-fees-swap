export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export const nofeeswapAbi = [
  {
    type: "function",
    name: "dispatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "input", type: "bytes" }],
    outputs: [
      { name: "output0", type: "int256" },
      { name: "output1", type: "int256" },
    ],
  },
  {
    type: "function",
    name: "unlock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "unlockTarget", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
] as const;

export const delegateeAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "unsaltedPoolId", type: "uint256" },
      { name: "tag0", type: "uint256" },
      { name: "tag1", type: "uint256" },
      { name: "poolGrowthPortion", type: "uint256" },
      { name: "kernelCompactArray", type: "uint256[]" },
      { name: "curveArray", type: "uint256[]" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
