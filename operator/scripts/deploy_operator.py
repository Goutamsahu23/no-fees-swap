# Copyright 2025, NoFeeSwap LLC - All rights reserved.
"""
Deploy Operator and register it on an existing NoFeeSwap singleton (Phase 5).

Matches SwapData_test.py: Operator.deploy(nofeeswap, 0, 0, 0) then setOperator.

From operator/:
  brownie run deploy_operator --network anvil

Reads Nofeeswap address from:
  - env NOFEESWAP_ADDRESS, or
  - ../core/deployments/anvil-core.json (sibling core checkout under same parent folder)

Use the same DEPLOYER_PRIVATE_KEY as Phase 5 (protocol admin on the singleton).

Optional env:
  DEPLOYER_PRIVATE_KEY — default: Anvil account #0
"""
import json
import os
from pathlib import Path

from brownie import Nofeeswap, Operator, accounts, network

ZERO = "0x0000000000000000000000000000000000000000"
_DEFAULT_ANVIL_PK = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)


def _deployer_account():
    pk = os.environ.get("DEPLOYER_PRIVATE_KEY", _DEFAULT_ANVIL_PK)
    if not pk.startswith("0x"):
        pk = "0x" + pk
    return accounts.add(pk)


def _load_nofeeswap_address() -> str:
    env_addr = os.environ.get("NOFEESWAP_ADDRESS")
    if env_addr:
        return env_addr
    operator_root = Path(__file__).resolve().parent.parent
    workspace = operator_root.parent
    core_json = workspace / "core" / "deployments" / "anvil-core.json"
    if not core_json.is_file():
        raise FileNotFoundError(
            f"Missing {core_json}. Run Phase 5 (brownie run deploy_core in core/) "
            "or set NOFEESWAP_ADDRESS."
        )
    data = json.loads(core_json.read_text(encoding="utf-8"))
    return data["nofeeswap"]


def main():
    active = network.show_active()
    print(f"Network: {active}  chain_id={network.chain.id}")

    root = _deployer_account()
    print(f"Deployer (protocol admin): {root.address}")

    ns_addr = _load_nofeeswap_address()
    print(f"Nofeeswap: {ns_addr}")

    nofeeswap = Nofeeswap.at(ns_addr)
    operator = Operator.deploy(nofeeswap, ZERO, ZERO, ZERO, {"from": root})
    print(f"Operator deployed: {operator.address}")

    nofeeswap.setOperator(operator, True, {"from": root})
    print("setOperator(operator, True) confirmed")

    out = {
        "network": active,
        "chainId": network.chain.id,
        "deployer": root.address,
        "nofeeswap": ns_addr,
        "operator": operator.address,
    }
    out_path = Path(__file__).resolve().parent.parent / "deployments" / "anvil-operator.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("Deployed:")
    print(json.dumps(out, indent=2))
    print(f"Wrote {out_path}")
