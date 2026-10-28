/**
 * interest-store.ts
 *
 * Offchain loan-request and expression-of-interest store.
 *
 * ⚠ DEPENDENCY NOTE (LB-006, LB-007):
 * This module currently persists data to localStorage ONLY.
 * Data is local to this browser and not visible to other wallets or devices.
 * Full private-group functionality requires the Supabase backend (Phase 4).
 * Until then:
 *   - Only the borrower's own browser sees the request and interest list.
 *   - To demo with two accounts on the same machine, use two browser profiles
 *     (e.g. Chrome default + Chrome Incognito) and manually copy the request ID.
 *   - The Supabase backend will replace this module entirely; all interfaces
 *     here are designed to map 1-to-1 to future Supabase RPC calls.
 */

export interface LoanRequest {
  id: string           // UUID, local-only until Supabase
  borrower: string     // lowercase 0x address (from connected wallet — not entered by user)
  amountUsdc: string   // human-readable, e.g. "5.00"
  durationDays: number
  note: string
  createdAt: number    // Unix ms
}

export interface InterestEntry {
  requestId: string
  lender: string       // lowercase 0x address
  timestamp: number    // Unix ms
}

const REQUESTS_KEY = 'loanbook:requests'
const INTEREST_KEY  = 'loanbook:interest'

// ── Requests ────────────────────────────────────────────────────────────────

function loadRequests(): LoanRequest[] {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? '[]') as LoanRequest[]
  } catch {
    return []
  }
}

function saveRequests(reqs: LoanRequest[]): void {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs))
}

export function createRequest(
  borrower: string,
  amountUsdc: string,
  durationDays: number,
  note: string,
): LoanRequest {
  const req: LoanRequest = {
    id: crypto.randomUUID(),
    borrower: borrower.toLowerCase(),
    amountUsdc,
    durationDays,
    note,
    createdAt: Date.now(),
  }
  const all = loadRequests()
  all.unshift(req)
  saveRequests(all)
  return req
}

export function getRequests(): LoanRequest[] {
  return loadRequests()
}

export function getRequest(id: string): LoanRequest | null {
  return loadRequests().find(r => r.id === id) ?? null
}

export function deleteRequest(id: string): void {
  saveRequests(loadRequests().filter(r => r.id !== id))
  // Also clear associated interests
  const all = loadInterest()
  saveInterest(all.filter(e => e.requestId !== id))
}

// ── Interest ─────────────────────────────────────────────────────────────────

function loadInterest(): InterestEntry[] {
  try {
    return JSON.parse(localStorage.getItem(INTEREST_KEY) ?? '[]') as InterestEntry[]
  } catch {
    return []
  }
}

function saveInterest(entries: InterestEntry[]): void {
  localStorage.setItem(INTEREST_KEY, JSON.stringify(entries))
}

export function expressInterest(requestId: string, lender: string): void {
  const all = loadInterest()
  const norm = lender.toLowerCase()
  // Idempotent — one expression per lender per request
  if (all.some(e => e.requestId === requestId && e.lender === norm)) return
  all.push({ requestId, lender: norm, timestamp: Date.now() })
  saveInterest(all)
}

export function getInterestForRequest(requestId: string): InterestEntry[] {
  return loadInterest().filter(e => e.requestId === requestId)
}

export function withdrawInterest(requestId: string, lender: string): void {
  const norm = lender.toLowerCase()
  saveInterest(loadInterest().filter(
    e => !(e.requestId === requestId && e.lender === norm)
  ))
}

export function hasExpressedInterest(requestId: string, lender: string): boolean {
  const norm = lender.toLowerCase()
  return loadInterest().some(e => e.requestId === requestId && e.lender === norm)
}
