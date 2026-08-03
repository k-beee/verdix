import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

// ─── Deployed contract address (update after Studio deployment) ───────────────
export const CONTRACT_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const EXPLORER_URL = 'https://explorer-bradbury.genlayer.com';
export const FAUCET_URL   = 'https://testnet-faucet.genlayer.foundation/';

// Read-only client — no wallet needed for view calls
export const readClient = createClient({ chain: testnetBradbury });

// Factory for a write-capable client once the user connects a wallet
export const makeSignerClient = (account: `0x${string}`) =>
  createClient({ chain: testnetBradbury, account });

export type SignerClient = ReturnType<typeof makeSignerClient>;

// ─── Field-length constraints (mirrors the contract) ─────────────────────────
export const LIMITS = {
  title:    { min: 5,  max: 120  },
  terms:    { min: 20, max: 1200 },
  evidence: { min: 10, max: 900  },
} as const;

// ─── Domain types ─────────────────────────────────────────────────────────────
export type CaseStatus =
  | 'ACTIVE'
  | 'DELIVERED'
  | 'CONTESTED'
  | 'AWARDED'
  | 'SETTLED'
  | 'DIVIDED';

export type PanelVerdict = 'AWARD' | 'REFUND' | 'DIVIDE' | '';

export interface PanelResult {
  verdict:       PanelVerdict;
  panel_percent: number;
  rationale:     string;
  ruling:        string;
}

export interface VerdixCase {
  id:                string;
  client:            string;
  contractor:        string;
  title:             string;
  terms:             string;
  locked:            string;   // u256 serialised as string
  status:            CaseStatus;
  deliverable:       string;
  client_statement:  string;
  counter_statement: string;
  contest_reason:    string;
  panel_verdict:     PanelResult;
  opened_at:         number;
  deadline:          number;
  contested_at:      number;
  resolved_at:       number;
}

export interface CourtDocket {
  total_filed:   number;
  open_disputes: number;
  closed_cases:  number;
}

// ─── Utility: RPC retry with exponential backoff ──────────────────────────────
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!/rate.?limit|429|timeout|network|fetch|too.?many/i.test(String(e))) throw e;
      await new Promise(r => setTimeout(r, 2500 * 2 ** i));
    }
  }
  throw lastErr;
}

// ─── Normalisation helpers ────────────────────────────────────────────────────
function toPlain<T>(v: unknown): T {
  if (v instanceof Map) {
    const o: Record<string, unknown> = {};
    for (const [k, val] of v.entries()) o[String(k)] = normalise(val);
    return o as T;
  }
  return v as T;
}

function normalise(v: unknown): unknown {
  if (v instanceof Map)    return toPlain(v);
  if (Array.isArray(v))    return v.map(normalise);
  if (typeof v === 'bigint') return v.toString();
  return v;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string { return String(v ?? ''); }

function parsePanelResult(raw: unknown): PanelResult {
  const r = toPlain<Record<string, unknown>>(raw);
  if (!r || Object.keys(r).length === 0)
    return { verdict: '', panel_percent: 0, rationale: '', ruling: '' };
  return {
    verdict:       (str(r.verdict).toUpperCase() as PanelVerdict) || '',
    panel_percent: num(r.panel_percent),
    rationale:     str(r.rationale),
    ruling:        str(r.ruling),
  };
}

function asCase(raw: unknown): VerdixCase {
  const r = toPlain<Record<string, unknown>>(raw);
  return {
    id:                str(r.id),
    client:            str(r.client),
    contractor:        str(r.contractor),
    title:             str(r.title),
    terms:             str(r.terms),
    locked:            str(r.locked),
    status:            (str(r.status).toUpperCase() as CaseStatus) || 'ACTIVE',
    deliverable:       str(r.deliverable),
    client_statement:  str(r.client_statement),
    counter_statement: str(r.counter_statement),
    contest_reason:    str(r.contest_reason),
    panel_verdict:     parsePanelResult(normalise(r.panel_verdict)),
    opened_at:         num(r.opened_at),
    deadline:          num(r.deadline),
    contested_at:      num(r.contested_at),
    resolved_at:       num(r.resolved_at),
  };
}

const ADDR = CONTRACT_ADDRESS as `0x${string}`;

// ─── Read functions ───────────────────────────────────────────────────────────
export async function fetchCases(start = 0, limit = 12): Promise<VerdixCase[]> {
  const raw = await withRetry(() =>
    readClient.readContract({ address: ADDR, functionName: 'get_cases', args: [start, limit] })
  );
  return ((normalise(raw) as unknown[]) ?? []).map(asCase);
}

export async function fetchCase(id: string): Promise<VerdixCase> {
  const raw = await withRetry(() =>
    readClient.readContract({ address: ADDR, functionName: 'get_case', args: [id] })
  );
  return asCase(normalise(raw));
}

export async function fetchDocket(): Promise<CourtDocket> {
  const raw = await withRetry(() =>
    readClient.readContract({ address: ADDR, functionName: 'get_docket', args: [] })
  );
  const r = toPlain<Record<string, unknown>>(normalise(raw));
  return {
    total_filed:   num(r.total_filed),
    open_disputes: num(r.open_disputes),
    closed_cases:  num(r.closed_cases),
  };
}

// ─── Write functions ──────────────────────────────────────────────────────────
export const openCaseTx = (
  client: SignerClient,
  contractor: string,
  title: string,
  terms: string,
  dueTimestamp: number,
  nowTimestamp: number,
  valueWei: bigint,
) => client.writeContract({
  address: ADDR, functionName: 'open_case',
  args: [contractor, title, terms, dueTimestamp, nowTimestamp],
  value: valueWei,
});

export const submitDeliverableTx = (client: SignerClient, caseId: string, deliverable: string) =>
  client.writeContract({ address: ADDR, functionName: 'submit_deliverable', args: [caseId, deliverable], value: 0n });

export const ratifyDeliveryTx = (client: SignerClient, caseId: string) =>
  client.writeContract({ address: ADDR, functionName: 'ratify_delivery', args: [caseId], value: 0n });

export const contestDeliveryTx = (client: SignerClient, caseId: string, statement: string, nowTimestamp: number) =>
  client.writeContract({ address: ADDR, functionName: 'contest_delivery', args: [caseId, statement, nowTimestamp], value: 0n });

export const fileRebuttalTx = (client: SignerClient, caseId: string, rebuttal: string) =>
  client.writeContract({ address: ADDR, functionName: 'file_rebuttal', args: [caseId, rebuttal], value: 0n });

export const invokePanelTx = (client: SignerClient, caseId: string, nowTimestamp: number) =>
  client.writeContract({ address: ADDR, functionName: 'invoke_panel', args: [caseId, nowTimestamp], value: 0n });

// ─── Transaction polling ──────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  '1': 'PENDING', '2': 'PROPOSING', '3': 'COMMITTING', '4': 'REVEALING',
  '5': 'ACCEPTED', '6': 'UNDETERMINED', '7': 'FINALIZED',
  '8': 'CANCELED', '12': 'VALIDATORS_TIMEOUT', '13': 'LEADER_TIMEOUT',
};

export const labelStatus = (s: unknown): string =>
  STATUS_LABELS[String(s)] ?? String(s ?? 'PENDING').toUpperCase();

const TERMINAL = new Set(['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED']);

export interface PanelDraft {
  verdict:       PanelVerdict;
  panel_percent: number;
  rationale?:    string;
  ruling?:       string;
}

function pick(obj: unknown, key: string): unknown {
  if (obj instanceof Map) return obj.get(key);
  if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
  return undefined;
}

export function extractPanelDraft(tx: unknown): PanelDraft | null {
  try {
    const receipts = pick(pick(tx, 'consensus_data'), 'leader_receipt');
    const first    = Array.isArray(receipts) ? receipts[0] : receipts;
    const b64      = pick(pick(first, 'eq_outputs'), '0');
    if (typeof b64 !== 'string' || !b64) return null;
    const text = atob(b64);
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] !== '{') continue;
      try {
        const obj = JSON.parse(text.slice(i)) as Record<string, unknown>;
        if (obj && 'verdict' in obj) {
          return {
            verdict:       (str(obj.verdict).toUpperCase() as PanelVerdict) || '',
            panel_percent: num(obj.panel_percent),
            rationale:     obj.rationale !== undefined ? str(obj.rationale) : undefined,
            ruling:        obj.ruling     !== undefined ? str(obj.ruling)     : undefined,
          };
        }
      } catch { /* keep scanning */ }
    }
    return null;
  } catch { return null; }
}

export async function pollTransaction(
  client: SignerClient,
  hash: `0x${string}`,
  onUpdate?: (status: string, draft: PanelDraft | null) => void,
): Promise<{ status: string; draft: PanelDraft | null }> {
  let draft: PanelDraft | null = null;
  for (let i = 0; i < 150; i++) {
    const tx     = await client.getTransaction({ hash } as Parameters<typeof client.getTransaction>[0]).catch(() => null);
    const status = labelStatus(tx ? (tx as { status?: unknown }).status : 'PENDING');
    draft        = extractPanelDraft(tx) ?? draft;
    onUpdate?.(status, draft);
    if (TERMINAL.has(status)) return { status, draft };
    await new Promise(r => setTimeout(r, 8000));
  }
  return { status: 'TIMEOUT', draft };
}
