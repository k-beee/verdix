# Verdix — AI-Powered Smart Escrow & Verdict Protocol

> *"An agreement is only as strong as the mechanism that enforces it."*

Verdix is a decentralised escrow and dispute resolution protocol built on [GenLayer](https://genlayer.com). It solves the fundamental trust gap in service-based agreements: the client fears paying for undelivered work; the contractor fears working without guaranteed payment.

When parties cannot agree, **Verdix convenes a multi-validator AI Panel** — a neutral body running in cryptographic consensus across GenLayer validator nodes. The Panel evaluates the agreement terms, submitted deliverables, and each party's sworn statement, then renders a binding financial verdict that automatically routes the locked GEN tokens with zero intermediary involvement.

---

## ⚖️ Why Verdix Needs GenLayer

Traditional smart contracts can only arbitrate deterministic facts (e.g., "did wallet X send Y tokens?"). They cannot evaluate subjective questions like "did the contractor's deliverable meet the agreed quality standard?" — the answer requires judgment, not binary logic.

Centralized alternatives (Kleros, escrow services, human arbitrators) reintroduce a trusted third party that either party must trust, creating new attack surfaces and censorship risks.

**GenLayer bridges this gap** by enabling non-deterministic contract execution with validator consensus:

- Multiple independent validator nodes each run the same AI prompt
- They each independently reach a verdict
- The protocol requires **cryptographic agreement** (categorical verdict equality + numeric split within ±10%) before the result is committed on-chain
- The verdict **directly triggers on-chain fund routing** — no withdrawal step, no manual release

No single actor — not the client, contractor, validator, or deployer — can unilaterally control the outcome.

---

## 🐉 Protocol Flow

```
                              VERDIX PROTOCOL DRAGON FLOW
                              ════════════════════════════

    Client                    VerdixCourt (GenVM)                Contractor
       │                             │                               │
       │  ── open_case(GEN) ──────►  │                               │
       │     title, terms,           │  ◄── contract stored ──►      │
       │     deadline, contractor    │  ◄── GEN locked in escrow ──► │
       │                             │                               │
       │                             │  ◄── submit_deliverable ──── ◄│
       │                             │     deliverable ref           │
       │                             │     status: ACTIVE → DELIVERED│
       │                             │                               │
       ├─ HAPPY PATH ──────────────────────────────────────────────── ┤
       │                             │                               │
       │  ── ratify_delivery() ───►  │                               │
       │                             │  ── 100% GEN to contractor ─► │
       │                             │     status: AWARDED            │
       │                             │                               │
       ├─ DISPUTE PATH ─────────────────────────────────────────────── ┤
       │                             │                               │
       │  ── contest_delivery() ──►  │                               │
       │     statement               │                               │
       │                             │     status: CONTESTED          │
       │                             │  ◄── file_rebuttal() ──────── ◄│
       │                             │     rebuttal                  │
       │                             │                               │
       │  ── invoke_panel() ──────►  │                               │
       │                             │                               │
       │              ╔══════════════╧══════════════════════════╗     │
       │              ║          AI PANEL CONSENSUS              ║     │
       │              ║                                          ║     │
       │              ║  ┌─────────────┐   ┌─────────────────┐  ║     │
       │              ║  │ LEADER NODE │   │ VALIDATOR NODE  │  ║     │
       │              ║  │             │   │      × N        │  ║     │
       │              ║  │ exec_prompt │   │  re-run prompt  │  ║     │
       │              ║  │ → verdict   │   │  → verdict      │  ║     │
       │              ║  │ → pct       │   │  → pct          │  ║     │
       │              ║  └──────┬──────┘   └────────┬────────┘  ║     │
       │              ║         │                   │           ║     │
       │              ║         ▼                   ▼           ║     │
       │              ║  ┌──────────────────────────────────┐   ║     │
       │              ║  │    EQUIVALENCE PRINCIPLE CHECK   │   ║     │
       │              ║  │                                  │   ║     │
       │              ║  │  ✓ verdict string  == exact match│   ║     │
       │              ║  │  ✓ panel_percent   within ±10%   │   ║     │
       │              ║  │                                  │   ║     │
       │              ║  │  AWARD  → contractor gets 100%   │   ║     │
       │              ║  │  REFUND → client gets 100%       │   ║     │
       │              ║  │  DIVIDE → proportional split     │   ║     │
       │              ║  └──────────────────────────────────┘   ║     │
       │              ╚══════════════╤══════════════════════════╝     │
       │                             │                               │
       │                             │  ── _disburse() ─────────────► │
       │  ◄── _disburse() ──────────  │     emit_transfer on-chain    │
       │     client share             │                               │
       │                             │     status: AWARDED            │
       │                             │           / SETTLED            │
       │                             │           / DIVIDED            │
       │                             │                               │
```

---

## 🏗️ Architecture

### Contract: `VerdixCourt` (`contracts/verdix.py`)

A single GenLayer Intelligent Contract holds the global case registry and all business logic.

**State machine:**

```
ACTIVE → DELIVERED → AWARDED
       ↘           ↗
         CONTESTED → SETTLED
                   → DIVIDED
```

**Storage layout:**

| Field           | Type              | Description                                |
|-----------------|-------------------|--------------------------------------------|
| `owner`         | `Address`         | Deployer address (governance reserved)      |
| `registry`      | `TreeMap[str,str]`| case_id → JSON-serialised `CaseRecord`      |
| `case_index`    | `DynArray[str]`   | Insertion-ordered case IDs                 |
| `total_filed`   | `u256`            | Monotonic counter of all cases              |
| `open_disputes` | `u256`            | Count of CONTESTED cases                    |
| `closed_cases`  | `u256`            | Cumulative resolved cases                   |

**Public write methods:**

| Method                | Caller           | Status Transition      | Description                                   |
|-----------------------|------------------|------------------------|-----------------------------------------------|
| `open_case`           | Client (payable) | → ACTIVE               | Open escrow, lock GEN                          |
| `submit_deliverable`  | Contractor       | ACTIVE → DELIVERED     | Submit work evidence                            |
| `ratify_delivery`     | Client           | */DELIVERED → AWARDED  | Approve work, release 100% to contractor       |
| `contest_delivery`    | Either party     | ACTIVE/DELIVERED → CONTESTED | Open dispute with statement             |
| `file_rebuttal`       | Non-contesting   | CONTESTED (no change)  | File counter-statement before panel            |
| `invoke_panel`        | Either party     | CONTESTED → terminal   | Convene AI panel, disburse verdict             |

**Public view methods:**

| Method                  | Returns             | Description                                      |
|-------------------------|---------------------|--------------------------------------------------|
| `get_case`              | `dict`              | Full case record by ID                            |
| `get_cases`             | `list`              | Paginated case list, newest-first                 |
| `get_cases_by_party`    | `list`              | Cases filtered by client/contractor wallet address |
| `get_active_disputes`   | `list`              | Most recent CONTESTED cases (dashboard widget)    |
| `get_docket`            | `dict`              | Court statistics (total/disputes/resolved)        |

---

### AI Panel Design

The Panel is invoked via `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`:

**Leader:**
1. Constructs a structured prompt containing case title, terms, deliverable, and both parties' statements
2. Calls `gl.nondet.exec_prompt(prompt, response_format="json")`
3. Parses the response through `_parse_panel_output()` which enforces:
   - Categorical consistency (AWARD forces 100%, REFUND forces 0%)
   - Percentage clamping (1–99 for DIVIDE, snaps to 50 if out of range)
   - Rationale and ruling text trimmed to storage limits

**Validator (per node):**
1. Re-runs `leader_fn()` independently against the same contract state
2. Checks **categorical verdict** for strict string equality (different labels = different financial outcomes)
3. Checks **numeric split** within ±10% tolerance (absorbs LLM temperature variance without opening verdict-flip exploits)
4. If the leader crashed with a tagged error, validates that the same error condition is reached

**Verdict dispatch:**

| Verdict  | `panel_percent` | Contractor receives | Client receives | Terminal status |
|----------|-----------------|---------------------|-----------------|-----------------|
| `AWARD`  | 100             | 100% of locked GEN  | 0               | `AWARDED`       |
| `REFUND` | 0               | 0                   | 100% of locked  | `SETTLED`       |
| `DIVIDE` | 1–99            | `pct`% of locked    | `100-pct`%      | `DIVIDED`       |

---

### Clock-Sync Hazard Resolution

GenLayer validators process transactions at slightly different wall-clock instants. Calling `datetime.now()` or `time.time()` inside the contract body would produce diverging state hashes and break consensus. Verdix eliminates this entirely: **all timestamps (`opened_at`, `deadline`, `contested_at`, `resolved_at`) are supplied by the transaction sender as explicit `u256` arguments**, never read from the environment.

---

### On-Chain Fund Disbursement

`_disburse()` uses `@gl.evm.contract_interface` to emit a native GEN transfer via the EVM child-message interface. Tokens arrive once the transaction reaches `FINALIZED` status (after the ~30-minute optimistic appeal window on Bradbury testnet). No manual withdrawal step is required.

---

### Frontend: `frontend/`

Built with Next.js 15 (App Router) + TypeScript + `genlayer-js`.

**Key components:**

| Component            | Purpose                                                         |
|----------------------|-----------------------------------------------------------------|
| `OpenCaseModal`      | Form: contractor address, title, terms, GEN amount, deadline    |
| `CaseWorkspace`      | Sticky right panel showing selected case + role-based actions   |
| `InvokePanelModal`   | Panel invocation with live consensus status stream + draft verdict |
| `TextActionModal`    | Generic write modal reused for deliverable, contest, rebuttal   |
| `VerdictBanner`      | Renders AWARD/REFUND/DIVIDE with pct, rationale, ruling         |
| `TxProgress`         | Animated progress bar tracking PENDING → FINALIZED              |
| `StatusBadge`        | Colour-coded pill for all 6 case statuses                       |

**Design system:** Navy/gold premium aesthetic. Cormorant Garamond display font + DM Mono + Outfit. Glass-morphism panels, animated background from generated theme image.

---

## 📁 Project Structure

```
verdix/
├── contracts/
│   └── verdix.py          ← VerdixCourt intelligent contract
├── tests/
│   └── integration/
│       └── test_verdix.py  ← Happy-path + panel arbitration tests
├── frontend/
│   ├── public/
│   │   └── verdix-bg.jpg   ← Theme background
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css ← Full design system
│   │   │   ├── layout.tsx  ← Root layout + fonts
│   │   │   └── page.tsx    ← Dashboard + all UI components
│   │   └── lib/
│   │       └── contract.ts ← genlayer-js integration layer
│   ├── next.config.ts
│   └── tsconfig.json
└── gltest.config.yaml
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- `genvm-lint` CLI (`pip install genlayer-cli`)
- `gltest` CLI (for integration tests against localnet)
- A GenLayer-compatible wallet (MetaMask + Bradbury RPC, or Studio wallet)

### 1. Clone & install

```bash
git clone https://github.com/k-beee/verdix.git
cd verdix/frontend
npm install
```

### 2. Validate the contract

```bash
# From project root
genvm-lint check contracts/verdix.py
# Expected: ✓ Lint passed (3 checks), ✓ Validation passed
```

### 3. Deploy the contract

Deploy `contracts/verdix.py` on [GenLayer Studio](https://studio.genlayer.com) or Bradbury testnet. Copy the deployed address.

### 4. Configure the frontend

Open `frontend/src/lib/contract.ts` and update:

```ts
export const CONTRACT_ADDRESS = '0xYOUR_DEPLOYED_ADDRESS' as const;
```

### 5. Run the frontend

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### 6. Run integration tests (requires localnet)

```bash
gltest tests/integration/ -v -s
```

---

## 🔬 Contract Verification

The contract source can be verified against the deployed bytecode via:

```
https://explorer-bradbury.genlayer.com/address/<CONTRACT_ADDRESS>
```

GenVM dependency pinned at commit hash: `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

---

## 🧠 Design Decisions & Trade-offs

### Evidence model
The Panel evaluates user-submitted text — the agreement terms, deliverable reference, and each party's statement. It does not independently fetch external URLs. This means the trust boundary is **"no single party controls the verdict"** (which is the primary value) rather than **"evidence is independently verified"** (which would require web-fetching the deliverable, a possible future enhancement via `gl.nondet.web.get`).

### Stall protection
In the current implementation, if a party raises a contest and the other never files a rebuttal, either party can still invoke the panel (which will weigh the missing statement as an absence of evidence). There is no time-based forced-resolution mechanism — this is planned for a future release where an expiry timestamp could allow uncontested auto-resolution.

### 10% numeric tolerance
LLM sampling temperature means that two independent validators running the same prompt may produce slightly different split percentages (e.g., 62% vs 68%). A strict equality check would cause constant finalization failures. The ±10% tolerance is a calibrated midpoint: small enough to prevent material verdict manipulation (a 10% difference in a 10 GEN escrow is 1 GEN), large enough to accommodate natural sampling variance.

### Percentage remainder
Integer division for fund splits means any indivisible remainder stays with the client, not the contractor. This is the conservative approach: the doubting party (who initiated escrow) retains dust rather than the receiving party claiming it.

---

## 🛡️ Security Properties

| Property                        | How it's enforced                                          |
|---------------------------------|------------------------------------------------------------|
| Self-escrow prevention          | `open_case` rejects `contractor == caller`                 |
| Statement immutability          | `file_rebuttal` rejects overwrites of existing statements  |
| Correct party enforcement       | Every method checks `msg.sender` against `client`/`contractor` |
| Numeric overflow safety         | All GEN amounts handled as `u256`, split via integer division |
| Prompt injection isolation      | Panel is addressed with a distinct persona; evidence is framed as user data |
| Error isolation                 | `_agree_on_failure` prevents a crashing leader from silently passing validation |

---

## 📜 Licence

MIT — see [LICENSE](LICENSE)

---

## 🔗 Links

- **Live App:** [verdix.vercel.app](https://verdix.vercel.app) *(update after deployment)*
- **GenLayer Explorer:** [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com)
- **Faucet:** [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation/)
- **GenLayer Docs:** [docs.genlayer.com](https://docs.genlayer.com)
