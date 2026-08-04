'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CaseStatus, CourtDocket, PanelDraft, VerdixCase,
  EXPLORER_URL, FAUCET_URL, LIMITS,
  contestDeliveryTx, fetchCase, fetchCases, fetchCasesByParty, fetchDocket,
  fileRebuttalTx, invokePanelTx, labelStatus, makeSignerClient,
  openCaseTx, pollTransaction, ratifyDeliveryTx, submitDeliverableTx,
} from '@/lib/contract'

// ─── Wallet hook — MetaMask first, private-key fallback ───────────────────────
function useWallet() {
  const [account, setAccount]           = useState<`0x${string}` | null>(null)
  const [showPkModal, setShowPkModal]   = useState(false)

  const connectMetaMask = useCallback(async (): Promise<boolean> => {
    const eth = (window as unknown as { ethereum?: { request: (a: {method:string}) => Promise<string[]> } }).ethereum
    if (!eth) return false
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      if (accounts[0]) { setAccount(accounts[0] as `0x${string}`); return true }
    } catch { /* user rejected */ }
    return false
  }, [])

  const connectWithKey = useCallback((pk: string) => {
    try {
      // derive address from private key via genlayer-js createAccount
      import('genlayer-js').then(({ createAccount }) => {
        const normalized = pk.startsWith('0x') ? pk : `0x${pk}`
        const acc = createAccount(normalized as `0x${string}`)
        setAccount(acc.address as `0x${string}`)
        setShowPkModal(false)
      })
    } catch {
      addToast('error', 'Invalid private key.')
    }
  }, [])

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') return
    const ok = await connectMetaMask()
    if (!ok) setShowPkModal(true)   // no MetaMask — show key modal
  }, [connectMetaMask])

  const disconnect = useCallback(() => setAccount(null), [])

  return {
    account, connect, disconnect,
    showPkModal, setShowPkModal, connectWithKey,
    signerClient: account ? makeSignerClient(account) : null,
  }
}

// ─── Private-key connect modal ────────────────────────────────────────────────
function WalletModal({ onClose, onConnect }: {
  onClose: () => void
  onConnect: (pk: string) => void
}) {
  const [pk, setPk] = useState('')
  const [show, setShow] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pk.trim()) return
    onConnect(pk.trim())
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--gold-400)', textTransform: 'uppercase', marginBottom: 6 }}>
              Testnet Wallet
            </div>
            <h2 className="modal-title">Connect Wallet</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--slate-400)', lineHeight: 1.7, marginBottom: 20 }}>
            No MetaMask detected. Enter your Bradbury testnet private key to continue.
            Your key is never stored — it lives only in memory for this session.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label">Private Key</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={show ? 'text' : 'password'}
                  placeholder="0x..."
                  value={pk}
                  onChange={e => setPk(e.target.value)}
                  required
                  style={{ paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--slate-500)', cursor: 'pointer',
                    fontSize: 12, fontFamily: 'var(--font-mono)'
                  }}
                >{show ? 'hide' : 'show'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" className="btn btn-gold btn-lg" style={{ flex: 1 }}
                disabled={!pk.trim()}>
                ⬡ Connect
              </button>
              <a className="btn btn-ghost btn-lg" href="https://testnet-faucet.genlayer.foundation/"
                target="_blank" rel="noreferrer">
                Get Test GEN ↗
              </a>
            </div>
          </form>
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(212,164,58,0.05)', border: '1px solid rgba(212,164,58,0.15)', borderRadius: 8 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)', lineHeight: 1.6 }}>
              ℹ This is a Bradbury testnet app. Only use testnet keys with no real value.
              For MetaMask, add the Bradbury network and connect normally.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Toast store ──────────────────────────────────────────────────────────────
type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; msg: string }
let _toastId = 0
let _setToasts: React.Dispatch<React.SetStateAction<Toast[]>> = () => {}

function addToast(kind: ToastKind, msg: string) {
  const id = _toastId++
  _setToasts(p => [...p, { id, kind, msg }])
  setTimeout(() => _setToasts(p => p.filter(t => t.id !== id)), 5500)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GEN = 1_000_000_000_000_000_000n // 1 GEN in wei

function fmt(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function formatGEN(wei: string): string {
  const n = BigInt(wei || '0')
  const whole = n / GEN
  const frac  = (n % GEN) * 100n / GEN
  return frac === 0n ? `${whole}` : `${whole}.${frac.toString().padStart(2, '0')}`
}

function tsLabel(ts: number): string {
  if (!ts || ts === 0) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const STATUS_ORDER: CaseStatus[] = ['ACTIVE', 'DELIVERED', 'CONTESTED', 'AWARDED', 'SETTLED', 'DIVIDED']

const PROGRESS_MAP: Record<string, number> = {
  PENDING: 10, PROPOSING: 25, COMMITTING: 45, REVEALING: 65, ACCEPTED: 85, FINALIZED: 100,
  UNDETERMINED: 80, CANCELED: 0, VALIDATORS_TIMEOUT: 60, LEADER_TIMEOUT: 55,
}

function useCharCount(val: string, max: number) {
  const cls = val.length > max ? 'over' : val.length > max * 0.9 ? 'warn' : ''
  return { count: val.length, cls }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`status-badge badge-${status}`}>{status}</span>
}

function VerdictBanner({ verdict }: { verdict: VerdixCase['panel_verdict'] | PanelDraft }) {
  if (!verdict.verdict) return null
  const labelMap: Record<string, string> = {
    AWARD: 'AWARDED TO CONTRACTOR', REFUND: 'REFUNDED TO CLIENT', DIVIDE: 'PROPORTIONAL SPLIT',
  }
  const pct = 'panel_percent' in verdict ? verdict.panel_percent : 0
  return (
    <div className={`verdict-banner ${verdict.verdict}`}>
      <span className="verdict-token">{labelMap[verdict.verdict] ?? verdict.verdict}</span>
      <div className="verdict-pct">
        Contractor receives {pct}% · Client receives {100 - pct}%
      </div>
      {('rationale' in verdict && verdict.rationale) && (
        <p style={{ marginTop: 10, fontSize: 11, opacity: 0.8, lineHeight: 1.6 }}>
          {verdict.rationale}
        </p>
      )}
    </div>
  )
}

function TxProgress({ hash, status, pct }: { hash: string; status: string; pct: number }) {
  return (
    <div className="tx-progress">
      <div className="tx-status-row">
        <span className="tx-status-label">⬡ {status}</span>
        <a className="tx-hash" href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
          {hash.slice(0, 8)}…{hash.slice(-6)} ↗
        </a>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Modal: Open New Case ─────────────────────────────────────────────────────
function OpenCaseModal({ onClose, account, signerClient, onDone }: {
  onClose: () => void
  account: string
  signerClient: ReturnType<typeof makeSignerClient>
  onDone: () => void
}) {
  const [contractor, setContractor] = useState('')
  const [title, setTitle] = useState('')
  const [terms, setTerms] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('14')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStatus, setTxStatus] = useState('')
  const [txPct, setTxPct] = useState(0)

  const titleC = useCharCount(title, LIMITS.title.max)
  const termsC = useCharCount(terms, LIMITS.terms.max)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signerClient) return
    setLoading(true)
    try {
      const nowTs  = Math.floor(Date.now() / 1000)
      const dueTs  = nowTs + parseInt(days) * 86400
      const valueWei = BigInt(Math.round(parseFloat(amount || '0') * 1e18))
      if (valueWei <= 0n) { addToast('error', 'Lock amount must be greater than 0 GEN'); setLoading(false); return }

      const hash = await openCaseTx(signerClient, contractor, title, terms, dueTs, nowTs, valueWei)
      setTxHash(hash as `0x${string}`)
      setTxStatus('PENDING')
      setTxPct(10)

      const { status } = await pollTransaction(signerClient, hash as `0x${string}`, (s) => {
        setTxStatus(s)
        setTxPct(PROGRESS_MAP[s] ?? 20)
      })

      if (status === 'ACCEPTED' || status === 'FINALIZED') {
        addToast('success', 'Case opened successfully and funds locked.')
        onDone()
        onClose()
      } else {
        addToast('error', `Transaction ended with status: ${status}`)
      }
    } catch (err) {
      addToast('error', String(err).slice(0, 180))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--gold-400)', textTransform: 'uppercase', marginBottom: 6 }}>
              New Case Filing
            </div>
            <h2 className="modal-title">Open Escrow Case</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">Contractor Address</label>
            <input className="form-input" placeholder="0x…" value={contractor} onChange={e => setContractor(e.target.value)} required disabled={loading} />
          </div>
          <div className="form-field">
            <label className="form-label">
              Case Title <span className={`char-counter ${titleC.cls}`}>{titleC.count}/{LIMITS.title.max}</span>
            </label>
            <input className="form-input" placeholder="e.g. Brand Identity Design Sprint" value={title}
              onChange={e => setTitle(e.target.value)} required disabled={loading} maxLength={LIMITS.title.max} />
          </div>
          <div className="form-field">
            <label className="form-label">
              Agreement Terms <span className={`char-counter ${termsC.cls}`}>{termsC.count}/{LIMITS.terms.max}</span>
            </label>
            <textarea className="form-textarea" rows={4}
              placeholder="Describe all deliverables, quality criteria and acceptance conditions clearly…"
              value={terms} onChange={e => setTerms(e.target.value)} required disabled={loading} maxLength={LIMITS.terms.max} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-field">
              <label className="form-label">Lock Amount <span className="form-hint">(GEN)</span></label>
              <input className="form-input" type="number" placeholder="e.g. 2.5" step="0.01" min="0"
                value={amount} onChange={e => setAmount(e.target.value)} required disabled={loading} />
            </div>
            <div className="form-field">
              <label className="form-label">Deadline <span className="form-hint">(days)</span></label>
              <input className="form-input" type="number" placeholder="14" min="1" max="365"
                value={days} onChange={e => setDays(e.target.value)} required disabled={loading} />
            </div>
          </div>

          {txHash && <TxProgress hash={txHash} status={txStatus} pct={txPct} />}

          <button type="submit" className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: 16 }} disabled={loading}>
            {loading ? <><span className="spinner" /> Processing…</> : '⬡ Open & Lock Funds'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Generic text-action modal ────────────────────────────────────────────────
function TextActionModal({ title, label, placeholder, minLen, maxLen, caseId, onClose, signerClient, onDone, txFn }: {
  title: string; label: string; placeholder: string; minLen: number; maxLen: number
  caseId: string; onClose: () => void
  signerClient: ReturnType<typeof makeSignerClient>
  onDone: () => void
  txFn: (client: ReturnType<typeof makeSignerClient>, caseId: string, text: string) => Promise<`0x${string}`>
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStatus, setTxStatus] = useState('')
  const [txPct, setTxPct] = useState(0)
  const cc = useCharCount(text, maxLen)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const hash = await txFn(signerClient, caseId, text)
      setTxHash(hash as `0x${string}`)
      setTxStatus('PENDING'); setTxPct(10)
      const { status } = await pollTransaction(signerClient, hash as `0x${string}`, s => {
        setTxStatus(s); setTxPct(PROGRESS_MAP[s] ?? 20)
      })
      if (status === 'ACCEPTED' || status === 'FINALIZED') {
        addToast('success', 'Transaction accepted.'); onDone(); onClose()
      } else {
        addToast('error', `Status: ${status}`)
      }
    } catch (err) { addToast('error', String(err).slice(0, 180)) }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">
              {label} <span className={`char-counter ${cc.cls}`}>{cc.count}/{maxLen}</span>
            </label>
            <textarea className="form-textarea" rows={5} placeholder={placeholder}
              value={text} onChange={e => setText(e.target.value)} required disabled={loading}
              minLength={minLen} maxLength={maxLen} />
          </div>
          {txHash && <TxProgress hash={txHash} status={txStatus} pct={txPct} />}
          <button type="submit" className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={loading || text.length < minLen}>
            {loading ? <><span className="spinner" /> Processing…</> : '⬡ Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Invoke Panel Modal ───────────────────────────────────────────────────────
function InvokePanelModal({ caseId, onClose, signerClient, onDone }: {
  caseId: string; onClose: () => void
  signerClient: ReturnType<typeof makeSignerClient>; onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStatus, setTxStatus] = useState('')
  const [txPct, setTxPct] = useState(0)
  const [draft, setDraft] = useState<PanelDraft | null>(null)

  const handleInvoke = async () => {
    setLoading(true)
    try {
      const nowTs = Math.floor(Date.now() / 1000)
      const hash  = await invokePanelTx(signerClient, caseId, nowTs)
      setTxHash(hash as `0x${string}`); setTxStatus('PENDING'); setTxPct(10)
      const { status, draft: d } = await pollTransaction(signerClient, hash as `0x${string}`, (s, dr) => {
        setTxStatus(s); setTxPct(PROGRESS_MAP[s] ?? 20); if (dr) setDraft(dr)
      })
      if (status === 'ACCEPTED' || status === 'FINALIZED') {
        addToast('success', 'Panel has rendered its verdict.'); onDone(); onClose()
      } else { addToast('error', `Status: ${status}`) }
    } catch (err) { addToast('error', String(err).slice(0, 180)) }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--gold-400)', textTransform: 'uppercase', marginBottom: 6 }}>
              AI Panel · Consensus Arbitration
            </div>
            <h2 className="modal-title">Invoke the Verdict Panel</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--slate-400)', lineHeight: 1.7, marginBottom: 20 }}>
            This will convene the GenLayer multi-validator AI panel to evaluate all submitted evidence.
            The panel will produce a binding <strong style={{ color: 'var(--gold-200)' }}>AWARD / REFUND / DIVIDE</strong> verdict
            and automatically route the locked GEN tokens. This process typically takes a few minutes
            as validators reach cryptographic consensus.
          </p>

          {draft && <VerdictBanner verdict={draft} />}
          {txHash && <TxProgress hash={txHash} status={txStatus} pct={txPct} />}

          <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: 16 }}
            onClick={handleInvoke} disabled={loading}>
            {loading
              ? <><span className="spinner" /> Awaiting consensus…</>
              : '⬡ Convene the Panel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Case Workspace (right panel) ────────────────────────────────────────────
type ModalType = 'none' | 'deliverable' | 'contest' | 'rebuttal' | 'panel'

function CaseWorkspace({ caseData, account, signerClient, onRefresh }: {
  caseData: VerdixCase; account: string | null
  signerClient: ReturnType<typeof makeSignerClient> | null; onRefresh: () => void
}) {
  const [modal, setModal] = useState<ModalType>('none')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStatus, setTxStatus] = useState('')
  const [txPct, setTxPct] = useState(0)
  const [ratifying, setRatifying] = useState(false)

  const isClient     = account?.toLowerCase() === caseData.client.toLowerCase()
  const isContractor = account?.toLowerCase() === caseData.contractor.toLowerCase()

  const handleRatify = async () => {
    if (!signerClient) return
    setRatifying(true)
    try {
      const hash = await ratifyDeliveryTx(signerClient, caseData.id)
      setTxHash(hash as `0x${string}`); setTxStatus('PENDING'); setTxPct(10)
      const { status } = await pollTransaction(signerClient, hash as `0x${string}`, s => {
        setTxStatus(s); setTxPct(PROGRESS_MAP[s] ?? 20)
      })
      if (status === 'ACCEPTED' || status === 'FINALIZED') {
        addToast('success', 'Delivery ratified. Funds released to contractor.'); onRefresh()
      } else { addToast('error', `Status: ${status}`) }
    } catch (err) { addToast('error', String(err).slice(0, 180)) }
    finally { setRatifying(false) }
  }

  const terminal = ['AWARDED', 'SETTLED', 'DIVIDED'].includes(caseData.status)

  return (
    <div className="case-detail">
      <div className="case-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="case-detail-id">{caseData.id}</div>
          <StatusBadge status={caseData.status} />
        </div>
        <h3 className="case-detail-title">{caseData.title}</h3>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Locked</span>
            <span className="amount-display">{formatGEN(caseData.locked)}<span className="amount-unit">GEN</span></span>
          </div>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Deadline</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--slate-300)' }}>{tsLabel(caseData.deadline)}</span>
          </div>
          {caseData.contested_at && caseData.contested_at > 0 && (
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Contested</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--amber)' }}>{tsLabel(caseData.contested_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Verdict */}
      {terminal && caseData.panel_verdict?.verdict && (
        <VerdictBanner verdict={caseData.panel_verdict} />
      )}

      {/* Agreement Terms */}
      <div className="detail-section">
        <span className="detail-label">Agreement Terms</span>
        <div className="detail-value">{caseData.terms || '—'}</div>
      </div>

      {/* Parties */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <span className="detail-label">Client</span>
          <div className="detail-value detail-addr">{fmt(caseData.client)}{isClient && ' (you)'}</div>
        </div>
        <div>
          <span className="detail-label">Contractor</span>
          <div className="detail-value detail-addr">{fmt(caseData.contractor)}{isContractor && ' (you)'}</div>
        </div>
      </div>

      {/* Deliverable */}
      {caseData.deliverable && (
        <div className="detail-section">
          <span className="detail-label">Submitted Deliverable</span>
          <div className="detail-value">{caseData.deliverable}</div>
        </div>
      )}

      {/* Statements */}
      {caseData.client_statement && (
        <div className="detail-section">
          <span className="detail-label">Client Statement</span>
          <div className="detail-value">{caseData.client_statement}</div>
        </div>
      )}

      {caseData.counter_statement && (
        <div className="detail-section">
          <span className="detail-label">Contractor Rebuttal</span>
          <div className="detail-value">{caseData.counter_statement}</div>
        </div>
      )}

      {/* Ruling text */}
      {terminal && caseData.panel_verdict?.ruling && (
        <div className="detail-section">
          <span className="detail-label">Panel Ruling</span>
          <div className="detail-value" style={{ fontStyle: 'italic' }}>{caseData.panel_verdict.ruling}</div>
        </div>
      )}

      {/* Tx progress */}
      {txHash && <TxProgress hash={txHash} status={txStatus} pct={txPct} />}

      {/* Actions */}
      {!terminal && account && (
        <div className="action-stack">
          {/* Contractor: submit deliverable */}
          {isContractor && caseData.status === 'ACTIVE' && (
            <button className="btn btn-gold" style={{ width: '100%' }} onClick={() => setModal('deliverable')}>
              ⬡ Submit Deliverable
            </button>
          )}

          {/* Client: ratify */}
          {isClient && caseData.status === 'DELIVERED' && (
            <button className="btn btn-gold" style={{ width: '100%' }} onClick={handleRatify} disabled={ratifying}>
              {ratifying ? <><span className="spinner" /> Processing…</> : '✓ Ratify & Release Funds'}
            </button>
          )}

          {/* Either party: contest */}
          {(isClient || isContractor) && ['ACTIVE', 'DELIVERED'].includes(caseData.status) && (
            <button className="btn btn-outline-gold" style={{ width: '100%' }} onClick={() => setModal('contest')}>
              ⚑ Open Contest
            </button>
          )}

          {/* Non-contesting party: file rebuttal */}
          {caseData.status === 'CONTESTED' && (
            <>
              {isClient && !caseData.client_statement && (
                <button className="btn btn-outline-gold" style={{ width: '100%' }} onClick={() => setModal('rebuttal')}>
                  ≡ File Client Statement
                </button>
              )}
              {isContractor && !caseData.counter_statement && (
                <button className="btn btn-outline-gold" style={{ width: '100%' }} onClick={() => setModal('rebuttal')}>
                  ≡ File Contractor Rebuttal
                </button>
              )}
              {(isClient || isContractor) && (
                <button className="btn btn-gold" style={{ width: '100%' }} onClick={() => setModal('panel')}>
                  ⬡ Invoke AI Panel
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {modal === 'deliverable' && signerClient && (
        <TextActionModal
          title="Submit Deliverable" label="Deliverable Reference"
          placeholder="Provide links, file paths, or a detailed description of the completed work…"
          minLen={LIMITS.evidence.min} maxLen={LIMITS.terms.max}
          caseId={caseData.id} onClose={() => setModal('none')}
          signerClient={signerClient} onDone={onRefresh}
          txFn={(c, id, text) => submitDeliverableTx(c, id, text) as Promise<`0x${string}`>}
        />
      )}
      {modal === 'contest' && signerClient && (
        <TextActionModal
          title="Open Contest" label="Your Statement"
          placeholder="Describe precisely how the other party has not met the agreement terms…"
          minLen={LIMITS.evidence.min} maxLen={LIMITS.terms.max}
          caseId={caseData.id} onClose={() => setModal('none')}
          signerClient={signerClient} onDone={onRefresh}
          txFn={async (c, id, text) => {
            const nowTs = Math.floor(Date.now() / 1000)
            return contestDeliveryTx(c, id, text, nowTs) as Promise<`0x${string}`>
          }}
        />
      )}
      {modal === 'rebuttal' && signerClient && (
        <TextActionModal
          title="File Rebuttal / Statement" label="Your Response"
          placeholder="Provide your evidence, rebuttal, or clarifications for the panel to review…"
          minLen={LIMITS.evidence.min} maxLen={LIMITS.terms.max}
          caseId={caseData.id} onClose={() => setModal('none')}
          signerClient={signerClient} onDone={onRefresh}
          txFn={(c, id, text) => fileRebuttalTx(c, id, text) as Promise<`0x${string}`>}
        />
      )}
      {modal === 'panel' && signerClient && (
        <InvokePanelModal
          caseId={caseData.id} onClose={() => setModal('none')}
          signerClient={signerClient} onDone={onRefresh}
        />
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const ALL_FILTERS = ['ALL', 'ACTIVE', 'DELIVERED', 'CONTESTED', 'RESOLVED', 'MY CASES'] as const
type Filter = typeof ALL_FILTERS[number]

export default function HomePage() {
  const { account, connect, disconnect, showPkModal, setShowPkModal, connectWithKey, signerClient } = useWallet()
  const [toasts, setToasts]     = useState<Toast[]>([])
  const [docket, setDocket]     = useState<CourtDocket>({ total_filed: 0, open_disputes: 0, closed_cases: 0 })
  const [cases, setCases]       = useState<VerdixCase[]>([])
  const [selected, setSelected] = useState<VerdixCase | null>(null)
  const [filter, setFilter]     = useState<Filter>('ALL')
  const [showModal, setShowModal] = useState(false)
  const [loadingCases, setLoadingCases] = useState(true)

  _setToasts = setToasts

  const loadData = useCallback(async () => {
    setLoadingCases(true)
    try {
      const [d, c] = await Promise.all([fetchDocket(), fetchCases(0, 50)])
      setDocket(d); setCases(c)
    } catch { /* silent — first load may fail if no RPC connection */ }
    finally { setLoadingCases(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // When filter switches to MY CASES, load wallet-specific cases
  const [myCases, setMyCases] = useState<VerdixCase[]>([])
  useEffect(() => {
    if (filter === 'MY CASES' && account) {
      fetchCasesByParty(account, 0, 30).then(setMyCases).catch(() => {})
    }
  }, [filter, account])

  // Auto-refresh selected case
  const refreshSelected = useCallback(async () => {
    await loadData()
    if (selected) {
      try {
        const fresh = await fetchCase(selected.id)
        setSelected(fresh)
      } catch { /* ignore */ }
    }
  }, [loadData, selected])

  const filteredCases = filter === 'MY CASES'
    ? myCases
    : cases.filter(c => {
        if (filter === 'ALL')      return true
        if (filter === 'RESOLVED') return ['AWARDED', 'SETTLED', 'DIVIDED'].includes(c.status)
        return c.status === filter
      })

  return (
    <div className="page-root">
      {/* Nav */}
      <nav className="nav-bar">
        <a className="nav-brand" href="/">
          <span className="nav-logotype">Verdix</span>
          <span className="nav-subtitle">AI Escrow · Verdict Protocol</span>
        </a>

        <div className="nav-stats">
          <div className="nav-stat-item">
            <span className="nav-stat-value">{docket.total_filed}</span>
            <span className="nav-stat-label">Total Cases</span>
          </div>
          <div className="nav-stat-item">
            <span className="nav-stat-value" style={{ color: 'var(--amber)' }}>{docket.open_disputes}</span>
            <span className="nav-stat-label">Active Disputes</span>
          </div>
          <div className="nav-stat-item">
            <span className="nav-stat-value" style={{ color: 'var(--emerald)' }}>{docket.closed_cases}</span>
            <span className="nav-stat-label">Resolved</span>
          </div>
        </div>

        <div className="nav-actions">
          {account ? (
            <>
              <div className="wallet-tag">
                <span className="wallet-dot" />
                {fmt(account)}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={disconnect}
                style={{ color: 'var(--slate-500)' }}>
                Disconnect
              </button>
              <button className="btn btn-gold" onClick={() => setShowModal(true)}>
                + Open Case
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={connect}>⬡ Connect Wallet</button>
              <button className="btn btn-gold" onClick={connect}>+ Open Case</button>
            </>
          )}
        </div>
      </nav>

      {/* Body */}
      <main className="main-grid">
        {/* Left — registry */}
        <div>
          {/* Hero */}
          <div className="hero-banner">
            <div>
              <div className="hero-label">⬡ GenLayer Consensus Arbitration</div>
              <h1 className="hero-title">Smart Escrow with AI Verdict Enforcement</h1>
              <p className="hero-body">
                Lock funds in a cryptographic contract. Submit deliverables against agreed terms.
                When parties disagree, GenLayer validators convene an impartial AI panel that renders
                a binding financial verdict — automatically disbursed with no intermediary.
              </p>
            </div>
            <div className="hero-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18"/><path d="m8 7-4 8a5 5 0 0 0 8 0"/><path d="m16 7 4 8a5 5 0 0 1-8 0"/>
                <path d="M3 7h18"/>
              </svg>
            </div>
          </div>

          {/* Guideline */}
          <div className="guide-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            <div>
              <div className="guide-body">
                Verdix runs on GenLayer Bradbury testnet. Acquire test GEN from the faucet, then open a case.
                Arbitration invokes a heavy consensus prompt — the panel may take a few minutes to reach agreement.
              </div>
              <div className="guide-links">
                <a className="guide-link" href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Testnet Faucet ↗
                </a>
                <a className="guide-link" href="https://explorer-bradbury.genlayer.com" target="_blank" rel="noreferrer">
                  Bradbury Explorer ↗
                </a>
              </div>
            </div>
          </div>

          {/* Registry header */}
          <div className="filter-row">
            <div className="section-eyebrow" style={{ margin: 0, flex: 1 }}>
              <span className="eyebrow-text">Case Registry</span>
              <div className="eyebrow-line" />
            </div>
            <div className="filter-tabs">
              {ALL_FILTERS.map(f => (
                <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}>{f}
                </button>
              ))}
            </div>
          </div>

          {/* Cases */}
          {loadingCases ? (
            <div className="empty-state">
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <span className="empty-state-text">Fetching registry…</span>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-text">No cases found for this filter.</span>
            </div>
          ) : (
            <div className="case-grid">
              {filteredCases.map(c => (
                <div key={c.id} className={`glass-panel case-card ${selected?.id === c.id ? 'selected' : ''}`}
                  onClick={() => setSelected(c)}>
                  <div className="case-card-top">
                    <div>
                      <div className="case-id">{c.id}</div>
                      <div className="case-title">{c.title}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="case-terms">{c.terms}</div>
                  <div className="case-meta">
                    <span className="case-meta-item">◈ {formatGEN(c.locked)} GEN</span>
                    <span className="case-meta-item">⬡ {fmt(c.client)}</span>
                    <span className="case-meta-item" style={{
                      color: c.deadline && c.deadline < Math.floor(Date.now() / 1000) && !['AWARDED','SETTLED','DIVIDED'].includes(c.status)
                        ? 'var(--rose)' : undefined
                    }}>
                      ↗ {c.deadline ? (
                        (() => {
                          const secs = c.deadline - Math.floor(Date.now() / 1000)
                          if (secs < 0) return `Overdue ${Math.round(-secs/86400)}d`
                          if (secs < 86400) return `Due in ${Math.round(secs/3600)}h`
                          return `Due in ${Math.round(secs/86400)}d`
                        })()
                      ) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — workspace */}
        <div className="workspace-sticky">
          <div className="glass-panel">
            {selected ? (
              <CaseWorkspace
                caseData={selected}
                account={account}
                signerClient={signerClient}
                onRefresh={refreshSelected}
              />
            ) : (
              <div className="workspace-empty">
                <div className="workspace-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
                  </svg>
                </div>
                <div className="workspace-title">No Case Selected</div>
                <p className="workspace-hint">
                  Select a case from the registry to view details and take action, or open a new case above.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Open Case Modal */}
      {showModal && account && signerClient && (
        <OpenCaseModal
          onClose={() => setShowModal(false)}
          account={account}
          signerClient={signerClient}
          onDone={loadData}
        />
      )}
      {showModal && !account && (() => { connect(); setShowModal(false); return null })()}

      {/* Wallet private-key modal */}
      {showPkModal && (
        <WalletModal
          onClose={() => setShowPkModal(false)}
          onConnect={connectWithKey}
        />
      )}

      {/* Toasts */}
      <div className="toast-root">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  )
}
