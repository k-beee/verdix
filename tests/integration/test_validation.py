"""
Edge-case tests for VerdixCourt input validation.

These tests exercise the on-chain guard rails: self-escrow rejection,
zero-value locks, out-of-bounds strings, wrong-party calls, and
duplicate statement rejections.  They are designed to run against a
GenLayer localnet instance via `gltest tests/ -v -s`.
"""

from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed
import pytest


@pytest.fixture
def setup():
    factory    = get_contract_factory("VerdixCourt")
    contract   = factory.deploy(args=[])
    client     = create_account()
    contractor = create_account()
    return contract, client, contractor


def open_basic(contract, client, contractor):
    """Helper: open a minimal valid case and return the case_id."""
    rc = contract.connect(client).open_case(
        args=[
            contractor.address,
            "Logo Design Package",
            "Deliver primary SVG logo, two variants, and a brand colour guide.",
            1720100000,
            1720000000,
        ],
        value=1_000_000_000_000_000_000,
    ).transact()
    assert tx_execution_succeeded(rc)
    return "VX-00000"


def test_self_escrow_rejected(setup):
    """Client cannot name themselves as the contractor."""
    contract, client, _ = setup
    rc = contract.connect(client).open_case(
        args=[
            client.address,       # ← same as sender
            "Self Test",
            "This should be rejected by the contract.",
            1720100000,
            1720000000,
        ],
        value=1_000_000_000_000_000_000,
    ).transact()
    assert tx_execution_failed(rc), "Self-escrow must be rejected"


def test_zero_value_rejected(setup):
    """open_case with zero GEN value must fail."""
    contract, client, contractor = setup
    rc = contract.connect(client).open_case(
        args=[
            contractor.address,
            "Zero Value Test",
            "This transaction sends no value and should be rejected.",
            1720100000,
            1720000000,
        ],
        value=0,
    ).transact()
    assert tx_execution_failed(rc), "Zero-value escrow must be rejected"


def test_wrong_contractor_rejected(setup):
    """A third party cannot submit a deliverable on another contractor's case."""
    contract, client, contractor = setup
    third = create_account()
    case_id = open_basic(contract, client, contractor)

    rc = contract.connect(third).submit_deliverable(
        args=[case_id, "Impersonation attempt — should fail."]
    ).transact()
    assert tx_execution_failed(rc), "Wrong-party deliverable submission must fail"


def test_wrong_client_ratify_rejected(setup):
    """Only the registered client may ratify a delivery."""
    contract, client, contractor = setup
    third = create_account()
    case_id = open_basic(contract, client, contractor)

    # Contractor delivers
    rc = contract.connect(contractor).submit_deliverable(
        args=[case_id, "Work delivered at https://example.com/work.zip"]
    ).transact()
    assert tx_execution_succeeded(rc)

    # Third party tries to ratify
    rc2 = contract.connect(third).ratify_delivery(args=[case_id]).transact()
    assert tx_execution_failed(rc2), "Wrong-party ratification must fail"


def test_duplicate_statement_rejected(setup):
    """A party cannot overwrite an already-filed statement via file_rebuttal."""
    contract, client, contractor = setup
    case_id = open_basic(contract, client, contractor)

    # Contractor delivers
    contract.connect(contractor).submit_deliverable(
        args=[case_id, "Delivered at https://example.com/logo-v1.zip"]
    ).transact()

    # Client contests — this records the client_statement
    contract.connect(client).contest_delivery(
        args=[case_id, "The logo only has one variant, not two as required.", 1720003600]
    ).transact()

    # Client tries to file again via rebuttal — must fail (statement already recorded)
    rc = contract.connect(client).file_rebuttal(
        args=[case_id, "Trying to overwrite my own statement."]
    ).transact()
    assert tx_execution_failed(rc), "Duplicate client statement must be rejected"


def test_nonexistent_case_rejected(setup):
    """Accessing a non-existent case ID must return a UserError."""
    contract, _, _ = setup
    rc = contract.get_case(args=["VX-99999"]).call
    # A call to a non-existent key should raise — verify via get_case
    try:
        contract.get_case(args=["VX-99999"]).call()
        assert False, "Should have raised on missing case"
    except Exception as exc:
        assert "does not exist" in str(exc).lower() or "[INPUT_ERROR]" in str(exc)

    print("[PASS] Non-existent case correctly raises error")


def test_docket_starts_empty(setup):
    """Fresh deployment should have all docket counters at zero."""
    contract, _, _ = setup
    docket = contract.get_docket(args=[]).call()
    assert int(docket["total_filed"])   == 0
    assert int(docket["open_disputes"]) == 0
    assert int(docket["closed_cases"])  == 0
    print("[PASS] Fresh docket is all zeros")
