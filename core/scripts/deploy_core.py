# Copyright 2025, NoFeeSwap LLC - All rights reserved.
"""
Deploy NoFeeSwap core to local Anvil (same sequence as tests/Initialize_test.py).

From core/:
  brownie run deploy_core --network anvil

Prereqs: anvil running (e.g. anvil --base-fee 0), brownie compile done.

Optional env:
  DEPLOYER_PRIVATE_KEY — hex key (default: Anvil account #0)
"""
import json
import os
from pathlib import Path

from brownie import Access, DeployerHelper, MockHook, Nofeeswap, NofeeswapDelegatee, accounts, network
from eth_abi import encode

_DEFAULT_ANVIL_PK = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)


def _deployer_account():
    pk = os.environ.get("DEPLOYER_PRIVATE_KEY", _DEFAULT_ANVIL_PK)
    if not pk.startswith("0x"):
        pk = "0x" + pk
    return accounts.add(pk)


def main():
    active = network.show_active()
    print(f"Network: {active}  chain_id={network.chain.id}")

    root = _deployer_account()
    print(f"Deployer: {root.address}")

    deployer = DeployerHelper.deploy(root, {"from": root})
    delegatee_addr = deployer.addressOf(1)
    nofeeswap_addr = deployer.addressOf(2)

    deployer.create3(
        1,
        NofeeswapDelegatee.bytecode + encode(["address"], [nofeeswap_addr]).hex(),
        {"from": root},
    )
    deployer.create3(
        2,
        Nofeeswap.bytecode + encode(["address", "address"], [delegatee_addr, root.address]).hex(),
        {"from": root},
    )

    delegatee = NofeeswapDelegatee.at(delegatee_addr)
    nofeeswap = Nofeeswap.at(nofeeswap_addr)
    access = Access.deploy({"from": root})
    hook = MockHook.deploy({"from": root})

    max_pool_growth_portion = 123
    protocol_growth_portion = 456
    packed = (max_pool_growth_portion << 208) + (protocol_growth_portion << 160) + int(root.address, 16)
    nofeeswap.dispatch(delegatee.modifyProtocol.encode_input(packed), {"from": root})

    out = {
        "network": active,
        "chainId": network.chain.id,
        "deployer": root.address,
        "deployerHelper": deployer.address,
        "nofeeswapDelegatee": delegatee.address,
        "nofeeswap": nofeeswap.address,
        "access": access.address,
        "mockHook": hook.address,
    }

    out_path = Path(__file__).resolve().parent.parent / "deployments" / "anvil-core.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("Deployed:")
    print(json.dumps(out, indent=2))
    print(f"Wrote {out_path}")
