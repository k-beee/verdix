"""
Utility functions shared across the Verdix test suite.

Provides account factories, GEN value helpers, and assertion
wrappers so test files stay clean and focused on logic.
"""

from gltest import create_account


# ─── Value helpers ────────────────────────────────────────────────────────────

def gen(amount: float) -> int:
    """
    Convert a human-readable GEN float to its wei integer equivalent.
    e.g.  gen(1.5)  →  1_500_000_000_000_000_000
    """
    return int(amount * 1e18)


def gen_from_wei(wei: int) -> float:
    """Convert a wei integer back to a GEN float for assertions."""
    return wei / 1e18


# ─── Timestamp helpers ────────────────────────────────────────────────────────

BASE_NOW = 1_720_000_000   # fixed "now" for deterministic tests
BASE_DUE = 1_720_100_000   # 27.8 hours after BASE_NOW


def now_ts(offset_seconds: int = 0) -> int:
    """Return a test "now" timestamp with an optional offset."""
    return BASE_NOW + offset_seconds


def due_ts(days: int = 1) -> int:
    """Return a test deadline `days` after BASE_NOW."""
    return BASE_NOW + days * 86_400


# ─── Account factory ──────────────────────────────────────────────────────────

def make_parties():
    """
    Create a fresh client and contractor account pair.
    Returns (client, contractor) — both are gltest Account objects.
    """
    return create_account(), create_account()


# ─── Case creation helpers ────────────────────────────────────────────────────

SAMPLE_TITLE = "Mobile UI Design Sprint"
SAMPLE_TERMS = (
    "Deliver high-fidelity Figma screens for the 6 core views of the mobile app: "
    "onboarding (2 screens), home dashboard, transaction list, profile settings, and "
    "notifications. All screens must include dark-mode variants."
)
SAMPLE_DELIVERABLE = (
    "Figma file at https://figma.com/file/TEST123. All 6 screens present with dark-mode "
    "variants. Developer handoff exported and shared via the project Zeplin board."
)
SAMPLE_STATEMENT = (
    "The deliverable is missing the notifications screen dark-mode variant. "
    "The Zeplin export link is returning a 404 error and was never made accessible."
)
SAMPLE_REBUTTAL = (
    "The notifications dark-mode was included on page 7 of the Figma file, labelled "
    "'Notif-DM'. The Zeplin link has been refreshed and re-shared — the old URL expired."
)


def open_case(contract, client, contractor, value_gen: float = 1.0) -> str:
    """Open a case with default test data and return the case_id."""
    from gltest.assertions import tx_execution_succeeded
    rc = contract.connect(client).open_case(
        args=[
            contractor.address,
            SAMPLE_TITLE,
            SAMPLE_TERMS,
            due_ts(7),
            now_ts(),
        ],
        value=gen(value_gen),
    ).transact()
    assert tx_execution_succeeded(rc), f"open_case failed: {rc}"
    return "VX-00000"


def deliver(contract, contractor, case_id: str) -> None:
    """Submit the sample deliverable for a case."""
    from gltest.assertions import tx_execution_succeeded
    rc = contract.connect(contractor).submit_deliverable(
        args=[case_id, SAMPLE_DELIVERABLE]
    ).transact()
    assert tx_execution_succeeded(rc), f"submit_deliverable failed: {rc}"


def contest(contract, client, case_id: str, offset: int = 3600) -> None:
    """Client contests a delivered case."""
    from gltest.assertions import tx_execution_succeeded
    rc = contract.connect(client).contest_delivery(
        args=[case_id, SAMPLE_STATEMENT, now_ts(offset)]
    ).transact()
    assert tx_execution_succeeded(rc), f"contest_delivery failed: {rc}"


def rebut(contract, contractor, case_id: str) -> None:
    """Contractor files a rebuttal."""
    from gltest.assertions import tx_execution_succeeded
    rc = contract.connect(contractor).file_rebuttal(
        args=[case_id, SAMPLE_REBUTTAL]
    ).transact()
    assert tx_execution_succeeded(rc), f"file_rebuttal failed: {rc}"
