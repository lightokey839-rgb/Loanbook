/**
 * Supabase client for LoanBook.
 *
 * Uses the anon key (safe to expose in browser) for all data operations.
 * RLS policies enforce row-level access based on the JWT that auth.ts issues.
 *
 * The auth server issues a JWT containing { wallet, role:'authenticated' }.
 * We set that JWT as the Supabase session token so RLS sees the correct wallet.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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
  onchain_loan_id: number | null
  created_at: string
  updated_at: string
}

export interface LoanInterest {
  id: string
  request_id: string
  lender: string
  created_at: string
}

// ── Client factory ────────────────────────────────────────────────────────

/** Returns null when env vars are not configured yet. */
export function makeSupabaseClient(jwtToken?: string): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null

  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: jwtToken
      ? { headers: { Authorization: `Bearer ${jwtToken}` } }
      : undefined,
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  })
  return client
}

// Singleton anon client for unauthenticated reads (public group lookup by invite code, etc.)
let _anonClient: SupabaseClient | null = null
export function getAnonClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null
  if (!_anonClient) _anonClient = makeSupabaseClient()
  return _anonClient
}
