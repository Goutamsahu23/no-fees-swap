# Copyright 2025, NoFeeSwap LLC - All rights reserved.
"""
Deploy two mock ERC20s (ERC20FixedSupply) and mint full supply to a test wallet.

Same helper as tests/Initialize_test.py / SwapData_test.py.

From core/:
  brownie run deploy_tokens --network anvil

Optional env:
  DEPLOYER_PRIVATE_KEY — pays gas (default: Anvil #0)
  TOKEN_RECIPIENT — address that receives all minted tokens (default: deployer)
  TOKEN0_SUPPLY, TOKEN1_SUPPLY — decimal strings, default huge (2**120)

If ../operator/deployments/anvil-operator.json exists, approves that operator for both tokens
(helps later swap / operator flows).
"""
import json
import os
from pathlib import Path

from brownie import ERC20FixedSupply, accounts, network

_DEFAULT_ANVIL_PK = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)
_DEFAULT_SUPPLY = 2**120


def _deployer_account():
    pk = os.environ.get("DEPLOYER_PRIVATE_KEY", _DEFAULT_ANVIL_PK)
    if not pk.startswith("0x"):
        pk = "0x" + pk
    return accounts.add(pk)


def _maybe_operator_address():
    core_root = Path(__file__).resolve().parent.parent
    workspace = core_root.parent
    op_json = workspace / "operator" / "deployments" / "anvil-operator.json"
    if not op_json.is_file():
        return None
    data = json.loads(op_json.read_text(encoding="utf-8"))
    return data.get("operator")


def main():
    active = network.show_active()
    print(f"Network: {active}  chain_id={network.chain.id}")

    deployer = _deployer_account()
    recipient = os.environ.get("TOKEN_RECIPIENT", deployer.address)
    if not recipient.startswith("0x"):
        recipient = "0x" + recipient

    s0 = int(os.environ.get("TOKEN0_SUPPLY", str(_DEFAULT_SUPPLY)))
    s1 = int(os.environ.get("TOKEN1_SUPPLY", str(_DEFAULT_SUPPLY)))

    print(f"Deployer (gas payer): {deployer.address}")
    print(f"Recipient (full balance minted here): {recipient}")

    token0 = ERC20FixedSupply.deploy("Mock Token 0", "MTK0", s0, recipient, {"from": deployer})
    token1 = ERC20FixedSupply.deploy("Mock Token 1", "MTK1", s1, recipient, {"from": deployer})
    print(f"Token0: {token0.address}  balance(recipient)={token0.balanceOf(recipient)}")
    print(f"Token1: {token1.address}  balance(recipient)={token1.balanceOf(recipient)}")

    # NoFeeSwap uses tag0 < tag1 by numeric address order
    a0, a1 = int(token0.address, 16), int(token1.address, 16)
    tag0_addr, tag1_addr = (token0.address, token1.address) if a0 < a1 else (token1.address, token0.address)
    print(f"For pool init: tag0 (lower addr) = {tag0_addr}")
    print(f"               tag1 (higher addr) = {tag1_addr}")

    operator_addr = _maybe_operator_address()
    if operator_addr:
        # Match SwapData_test-style allowance for operator integration
        approve_amt = 2**256 - 1
        if recipient.lower() == deployer.address.lower():
            token0.approve(operator_addr, approve_amt, {"from": deployer})
            token1.approve(operator_addr, approve_amt, {"from": deployer})
            print(f"Approved operator {operator_addr} for both tokens (from recipient/deployer)")
        else:
            print(
                "Operator JSON found but TOKEN_RECIPIENT != deployer; "
                "approve manually from recipient if needed."
            )
    else:
        print("No operator/deployments/anvil-operator.json — skip auto-approve")

    out = {
        "network": active,
        "chainId": network.chain.id,
        "deployer": deployer.address,
        "recipient": recipient,
        "token0": token0.address,
        "token1": token1.address,
        "tag0": tag0_addr,
        "tag1": tag1_addr,
        "operatorApproved": bool(operator_addr and recipient.lower() == deployer.address.lower()),
    }
    out_path = Path(__file__).resolve().parent.parent / "deployments" / "anvil-tokens.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("Wrote:")
    print(json.dumps(out, indent=2))
    print(f"File: {out_path}")
