# Security Policy

## Supported Versions

Verdix is currently in testnet phase. The following versions receive security attention:

| Version | Supported |
|---------|-----------|
| main    | ✅        |

## Scope

### In scope
- `contracts/verdix.py` — the on-chain VerdixCourt intelligent contract
- `frontend/src/lib/contract.ts` — the genlayer-js integration layer
- Logic bugs that could cause incorrect fund disbursement
- Access control bypasses (wrong-party method calls)
- Validator equivalence principle weaknesses

### Out of scope
- GenLayer protocol-level vulnerabilities (report to GenLayer directly)
- Frontend XSS/CSRF (the app has no backend server)
- Social engineering attacks

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

To report a vulnerability:

1. Open a [GitHub Security Advisory](https://github.com/k-beee/verdix/security/advisories/new) in private
2. Describe the vulnerability, affected code, and a proof-of-concept if possible
3. We will acknowledge within 48 hours and aim to resolve within 14 days

## Known Limitations

1. **No deadline enforcement** — there is no time-based fallback to prevent indefinitely locked funds if one party ignores the dispute process. This is acknowledged future work.

2. **Evidence is user-submitted text** — the AI panel evaluates narratives, not independently fetched or verified data. A party could misrepresent their deliverable in their statement.

3. **Testnet only** — Verdix is deployed on GenLayer Bradbury testnet. Funds are test GEN with no real monetary value. A mainnet deployment would require a full security audit.
