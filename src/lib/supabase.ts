/**
 * Supabase client for LoanBook — native Web3 auth (migration 003+)
 *
 * Uses Supabase's built-in signInWithWeb3 (EIP-4361 / SIWE).
 * No custom JWT minting, no separate auth server, no SUPABASE_JWT_SECRET needed.
 *
 * The browser uses a single shared client with `persistSession: true` so the
 * Supabase SDK manages token storage and refresh automatically.
 *
 * RLS policies use get_my_wallet() which reads the wallet address from the
 * verified auth.identities record, never editable user_metadata.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env?.VITE_SUPABASE_URL  as string | undefined
const SUPABASE_ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined

// ── Types matching the DB schema ──────────────────────────────────────────

export interface Profile {
  id: string
  wallet: string
  display_name: string | null
  created_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  owner: string
  invite_code: string
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  wallet: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface Message {
  id: string
  group_id: string
  sender: string
  body: string
  created_at: string
}

export interface LoanRequest {
  id: string
  group_id: string
  borrower: string
  amount_usdc: string
  duration_days: number
  note: string
  status: 'open' | 'lender_selected' | 'funded' | 'repaid' | 'cancelled'
  selected_lender: string | null
  onchain_loan_id: number | string | null
  chain_id: number | null
  contract_address: string | null
  binding_started_at: string | null
  creation_tx: string | null
  creation_block: number | null
  funding_tx: string | null
  repayment_tx: string | null
  cancellation_tx: string | null
  verified_block: number | null
  due_at: string | null
  created_at: string
  updated_at: string
}

export interface LoanInterest {
  id: string
  request_id: string
  lender: string
  lender_id: string
  created_at: string
}

// ── Supabase is configured check ─────────────────────────────────────────────

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON)
}

// ── Singleton client ──────────────────────────────────────────────────────────
// One client instance for the whole app. Supabase manages the session
// (stored in localStorage by default) and auto-refreshes the token.

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return _client
}

// Legacy export used by community components (returns the same singleton)
export function makeSupabaseClient(): SupabaseClient | null {
  return getSupabaseClient()
}

// Also exported for the anon (unauthenticated) path (invite-code public lookup etc.)
export function getAnonClient(): SupabaseClient | null {
  return getSupabaseClient()
}
