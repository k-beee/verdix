/**
 * Verdix contract constants — centralise all protocol-level values
 * so that contract.ts and page components can import from a single source
 * without diverging if limits or status labels change.
 */

/** All possible case lifecycle statuses, in progression order */
export const CASE_STATUSES = [
  'ACTIVE',
  'DELIVERED',
  'CONTESTED',
  'AWARDED',
  'SETTLED',
  'DIVIDED',
] as const

export type CaseStatus = typeof CASE_STATUSES[number]

/** Terminal statuses (case is fully resolved, no further action possible) */
export const TERMINAL_STATUSES = new Set<string>(['AWARDED', 'SETTLED', 'DIVIDED'])

/** The three panel verdict tokens */
export const PANEL_VERDICTS = ['AWARD', 'REFUND', 'DIVIDE'] as const
export type PanelVerdict = typeof PANEL_VERDICTS[number] | ''

/** Human-readable label for each verdict */
export const VERDICT_LABELS: Record<string, string> = {
  AWARD:  'Awarded to Contractor',
  REFUND: 'Refunded to Client',
  DIVIDE: 'Proportional Split',
}

/** Colour class suffix for verdict banners */
export const VERDICT_COLOUR: Record<string, string> = {
  AWARD:  'emerald',
  REFUND: 'rose',
  DIVIDE: 'gold',
}

/** GenLayer consensus phase status labels */
export const TX_STATUS_LABELS: Record<string, string> = {
  '1':  'PENDING',
  '2':  'PROPOSING',
  '3':  'COMMITTING',
  '4':  'REVEALING',
  '5':  'ACCEPTED',
  '6':  'UNDETERMINED',
  '7':  'FINALIZED',
  '8':  'CANCELED',
  '12': 'VALIDATORS_TIMEOUT',
  '13': 'LEADER_TIMEOUT',
}

/** Progress percentage for each consensus phase (for the progress bar) */
export const TX_PROGRESS: Record<string, number> = {
  PENDING:            10,
  PROPOSING:          25,
  COMMITTING:         45,
  REVEALING:          65,
  ACCEPTED:           85,
  FINALIZED:         100,
  UNDETERMINED:       80,
  CANCELED:            0,
  VALIDATORS_TIMEOUT: 60,
  LEADER_TIMEOUT:     55,
}

/** Consensus statuses that mark a transaction as done (success or failure) */
export const TERMINAL_TX = new Set(['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED'])

/** Input length limits mirroring the contract's LIMITS constants */
export const FIELD_LIMITS = {
  title:    { min: 5,  max: 120  },
  terms:    { min: 20, max: 1200 },
  evidence: { min: 10, max: 900  },
  days:     { min: 1,  max: 365  },
} as const

/** Default page size for case listing */
export const DEFAULT_PAGE_SIZE = 20

/** 1 GEN in wei (as bigint) */
export const ONE_GEN = BigInt(1_000_000_000_000_000_000)
