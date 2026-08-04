"""
Pytest configuration for Verdix integration tests.
Registers custom markers so gltest doesn't warn about unknown marks.
"""
import pytest

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: marks tests that invoke the AI panel (may take minutes)"
    )
    config.addinivalue_line(
        "markers", "validation: marks tests that exercise input guard rails"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests that require a running GenLayer localnet"
    )
