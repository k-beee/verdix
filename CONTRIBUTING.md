# Contributing to Verdix

Thanks for your interest in contributing to Verdix! This document describes how to set up the development environment and submit changes.

## Project Layout

```
verdix/
├── contracts/       ← GenLayer Intelligent Contract (Python)
├── tests/           ← Integration test suite (gltest)
└── frontend/        ← Next.js 15 / TypeScript dashboard
```

## Development Setup

### Contract

```bash
# Install GenLayer CLI
pip install genlayer-cli

# Validate the contract
genvm-lint check contracts/verdix.py

# Run integration tests against localnet
gltest tests/ -v -s
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_CONTRACT_ADDRESS
npm run dev
```

## Contract Changes

When modifying `contracts/verdix.py`:

1. Run `genvm-lint check contracts/verdix.py` — must pass all 3 checks
2. Run integration tests if localnet is available
3. Document any new public method in the README state machine table
4. If adding a new view method, add a corresponding fetch function in `frontend/src/lib/contract.ts`

## Frontend Changes

1. `npm run build` must pass with no errors
2. All new contract method calls must go through `frontend/src/lib/contract.ts`
3. Use CSS custom properties from `globals.css` — do not hardcode colours in component files
4. New interactive elements need unique `id` attributes for testability

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope):  new feature
fix(scope):   bug fix
docs:         documentation only
test:         test additions or corrections
refactor:     code change with no behaviour change
chore:        tooling, config, dependencies
```

## Submitting Changes

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Commit your changes following the convention above
4. Push and open a pull request against `main`

## Code Style

- **Contract:** Follow the existing docstring format; all helpers must be commented
- **TypeScript:** No `any` types; use the typed interfaces in `contract.ts`
- **CSS:** Use only design-system tokens; avoid hardcoded hex values in component styles
