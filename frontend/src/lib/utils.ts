/**
 * Verdix utility helpers — date formatting, address truncation,
 * GEN amount display, and timestamp utilities used across the UI.
 */

/** Shorten an address to `0x1234…abcd` format */
export function shortAddr(addr: string, head = 8, tail = 6): string {
  if (!addr || addr.length < head + tail) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

/** Check if two hex addresses are the same wallet */
export function sameAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Format a u256 wei value as a human-readable GEN string (2 decimal places) */
export function weiToGEN(wei: string | bigint): string {
  const n = typeof wei === 'bigint' ? wei : BigInt(wei || '0')
  const GEN = BigInt(1e18)
  const whole = n / GEN
  const frac = (n % GEN) * 100n / GEN
  if (frac === 0n) return `${whole}`
  return `${whole}.${frac.toString().padStart(2, '0')}`
}

/** Format a GEN amount back to wei (bigint) */
export function genToWei(gen: number): bigint {
  const scaled = Math.round(gen * 1e4)
  return BigInt(scaled) * BigInt(1e14)
}

/** Format a Unix timestamp (seconds) to a short date string */
export function shortDate(ts: number | string): string {
  const n = Number(ts)
  if (!n) return '—'
  return new Date(n * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Return seconds until a deadline (negative if past) */
export function secondsUntil(ts: number): number {
  return ts - Math.floor(Date.now() / 1000)
}

/** Human-readable relative time ("in 3 days", "2 hours ago") */
export function relativeTime(ts: number): string {
  const diff = secondsUntil(ts)
  const abs  = Math.abs(diff)
  const past = diff < 0
  if (abs < 60)   return past ? 'just now' : 'in a moment'
  if (abs < 3600) { const m = Math.round(abs / 60); return past ? `${m}m ago` : `in ${m}m` }
  if (abs < 86400){ const h = Math.round(abs / 3600); return past ? `${h}h ago` : `in ${h}h` }
  const d = Math.round(abs / 86400)
  return past ? `${d}d ago` : `in ${d}d`
}

/** Current unix timestamp in seconds */
export function nowTs(): number {
  return Math.floor(Date.now() / 1000)
}

/** Generate a future unix timestamp `days` from now */
export function futureTs(days: number): number {
  return nowTs() + days * 86400
}

/** Truncate long text with ellipsis */
export function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
