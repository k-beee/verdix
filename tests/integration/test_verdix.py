"""
Integration test suite for VerdixCourt

Covers the two primary flows through the protocol:
  1. Happy path  — contractor delivers, client ratifies, full payout
  2. Contest path — client contests, contractor rebuts, AI panel invoked

These tests are designed to run against a GenLayer localnet instance.
To execute:
    gltest tests/integration/ -v -s
"""

from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed
import json


def test_ratify_flow():
    """
    Happy-path flow: client opens case → contractor delivers → client ratifies.
    No panel is invoked; full locked balance should route to the contractor.
    """
    factory  = get_contract_factory("VerdixCourt")
    contract = factory.deploy(args=[])

    client     = create_account()
    contractor = create_account()

    # ── Step 1: Open a new case with 2 GEN locked ────────────────────────────
    due  = 1720100000
    now  = 1720000000

    rc = contract.connect(client).open_case(
        args=[
            contractor.address,
            "Brand Identity Package",
            (
                "Contractor must deliver a full brand identity package consisting of: "
                "a primary logo (SVG + PNG), a secondary wordmark, a 12-page brand "
                "guidelines PDF, and a colour palette with hex codes."
            ),
            due,
            now,
        ],
        value=2_000_000_000_000_000_000,  # 2 GEN
    ).transact()

    assert tx_execution_succeeded(rc), "open_case should succeed"

    case = contract.get_case(args=["VX-00000"]).call()
    assert case["id"]         == "VX-00000"
    assert case["status"]     == "ACTIVE"
    assert case["client"]     == client.address.as_hex
    assert case["contractor"] == contractor.address.as_hex
    assert case["locked"]     == str(2_000_000_000_000_000_000)

    # ── Step 2: Contractor submits deliverable ────────────────────────────────
    rc2 = contract.connect(contractor).submit_deliverable(
        args=[
            "VX-00000",
            (
                "Final assets delivered at https://cdn.example.com/brand-VX00000.zip "
                "— package includes SVG logo, PNG exports at 1x/2x/3x, guidelines PDF "
                "and a Figma token export."
            ),
        ]
    ).transact()

    assert tx_execution_succeeded(rc2), "submit_deliverable should succeed"

    case2 = contract.get_case(args=["VX-00000"]).call()
    assert case2["status"]      == "DELIVERED"
    assert case2["deliverable"] != ""

    # ── Step 3: Client ratifies — triggers full payout to contractor ──────────
    rc3 = contract.connect(client).ratify_delivery(
        args=["VX-00000"]
    ).transact()

    assert tx_execution_succeeded(rc3), "ratify_delivery should succeed"

    case3 = contract.get_case(args=["VX-00000"]).call()
    assert case3["status"] == "AWARDED"

    print("[PASS] Happy-path flow: case AWARDED after ratification")


def test_panel_arbitration_flow():
    """
    Contest path: client opens case → contractor delivers → client contests →
    contractor rebuts → panel invoked → case resolved with valid verdict.
    """
    factory  = get_contract_factory("VerdixCourt")
    contract = factory.deploy(args=[])

    client     = create_account()
    contractor = create_account()

    due = 1720100000
    now = 1720000000

    # ── Step 1: Open case ─────────────────────────────────────────────────────
    rc = contract.connect(client).open_case(
        args=[
            contractor.address,
            "Mobile App UI Design Sprint",
            (
                "Contractor must deliver high-fidelity Figma screens for all 8 "
                "core views of the mobile app: onboarding (3 screens), home dashboard, "
                "transaction history, profile settings, notifications, and a help centre. "
                "All screens must include dark-mode variants and exported developer handoff."
            ),
            due,
            now,
        ],
        value=1_500_000_000_000_000_000,  # 1.5 GEN
    ).transact()

    assert tx_execution_succeeded(rc)

    # ── Step 2: Contractor submits ────────────────────────────────────────────
    rc2 = contract.connect(contractor).submit_deliverable(
        args=[
            "VX-00000",
            (
                "Figma file shared at https://figma.com/file/XYZ123. "
                "All 8 screens are present, dark-mode variants included. "
                "Developer handoff exported to Zeplin — link in project notes."
            ),
        ]
    ).transact()

    assert tx_execution_succeeded(rc2)

    # ── Step 3: Client contests ───────────────────────────────────────────────
    rc3 = contract.connect(client).contest_delivery(
        args=[
            "VX-00000",
            (
                "The Figma file is missing the onboarding screen 3 and the "
                "notifications view entirely. Dark-mode variants are only partially "
                "complete — home dashboard and profile settings are missing dark-mode. "
                "Developer handoff is not accessible in Zeplin."
            ),
            now + 3600,
        ]
    ).transact()

    assert tx_execution_succeeded(rc3)

    case3 = contract.get_case(args=["VX-00000"]).call()
    assert case3["status"] == "CONTESTED"
    assert case3["client_statement"] != ""

    # ── Step 4: Contractor rebuts ─────────────────────────────────────────────
    rc4 = contract.connect(contractor).file_rebuttal(
        args=[
            "VX-00000",
            (
                "Onboarding screen 3 is on page 4 of the file — the client may have "
                "missed it because the page was named 'OB-Final'. Notifications view "
                "is labelled 'Alerts' per the original brief. Dark-mode exports were "
                "uploaded to a shared Dropbox: https://dropbox.com/sh/ABC. Zeplin "
                "access was sent to the client email on record."
            ),
        ]
    ).transact()

    assert tx_execution_succeeded(rc4)

    case4 = contract.get_case(args=["VX-00000"]).call()
    assert case4["counter_statement"] != ""

    # ── Step 5: Panel invoked ─────────────────────────────────────────────────
    rc5 = contract.connect(client).invoke_panel(
        args=["VX-00000", now + 7200]
    ).transact()

    assert tx_execution_succeeded(rc5)

    case5 = contract.get_case(args=["VX-00000"]).call()
    assert case5["status"] in ("AWARDED", "SETTLED", "DIVIDED"), (
        f"Unexpected terminal status: {case5['status']}"
    )
    assert "verdict" in case5["panel_verdict"]
    assert 0 <= int(case5["panel_verdict"]["panel_percent"]) <= 100

    print(f"[PASS] Panel verdict: {case5['panel_verdict']['verdict']}")
    print(f"       Contractor share: {case5['panel_verdict']['panel_percent']} %")
    print(f"       Rationale: {case5['panel_verdict']['rationale']}")

    # ── Step 6: Verify global docket stats ────────────────────────────────────
    docket = contract.get_docket(args=[]).call()
    assert int(docket["total_filed"])  == 1
    assert int(docket["closed_cases"]) == 1
    assert int(docket["open_disputes"]) == 0

    print(f"[PASS] Docket: {docket}")


def test_unauthorized_invoke_panel_fails():
    """
    Verification that an unauthorized third party fails to invoke the panel.
    """
    factory  = get_contract_factory("VerdixCourt")
    contract = factory.deploy(args=[])

    client      = create_account()
    contractor  = create_account()
    third_party = create_account()

    due = 1720100000
    now = 1720000000

    # client opens case
    contract.connect(client).open_case(
        args=[contractor.address, "Brand Identity Package", "Must deliver full SVG guidelines.", due, now],
        value=1_000_000_000_000_000_000,
    ).transact()

    # contractor submits
    contract.connect(contractor).submit_deliverable(
        args=["VX-00000", "Figma file links here."],
    ).transact()

    # client contests
    contract.connect(client).contest_delivery(
        args=["VX-00000", "Missing brand guidelines PDF.", now + 3600],
    ).transact()

    # contractor rebuts
    contract.connect(contractor).file_rebuttal(
        args=["VX-00000", "Zeplin upload was emailed."],
    ).transact()

    # unauthorized party tries to convene panel -> must fail
    rc_fail = contract.connect(third_party).invoke_panel(
        args=["VX-00000", now + 7200]
    ).transact()

    assert tx_execution_failed(rc_fail), "Unauthorized third party should fail to invoke the panel"
    print("[PASS] Unauthorized panel invocation successfully rejected")


def test_premature_invoke_panel_fails():
    """
    Verification that calling invoke_panel prematurely (before rebuttal is ready) fails.
    """
    factory  = get_contract_factory("VerdixCourt")
    contract = factory.deploy(args=[])

    client     = create_account()
    contractor = create_account()

    due = 1720100000
    now = 1720000000

    # client opens case
    contract.connect(client).open_case(
        args=[contractor.address, "Brand Identity Package", "Must deliver full SVG guidelines.", due, now],
        value=1_000_000_000_000_000_000,
    ).transact()

    # contractor submits
    contract.connect(contractor).submit_deliverable(
        args=["VX-00000", "Figma file links here."],
    ).transact()

    # client contests
    contract.connect(client).contest_delivery(
        args=["VX-00000", "Missing brand guidelines PDF.", now + 3600],
    ).transact()

    # contractor has NOT rebutted yet — try to invoke panel prematurely -> must fail
    rc_fail = contract.connect(client).invoke_panel(
        args=["VX-00000", now + 7200]
    ).transact()

    assert tx_execution_failed(rc_fail), "Premature panel invocation before rebuttal is ready should fail"
    print("[PASS] Premature panel invocation successfully rejected")
