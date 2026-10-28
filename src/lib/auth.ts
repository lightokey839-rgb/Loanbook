/**
 * Wallet-signature authentication for LoanBook.
 *
 * Flow:
 *  1. Request a nonce from /api/auth/nonce  (POST { wallet })
 *  2. Show a pre-structured SIWE message to the wallet for personal_sign
 *  3. POST { wallet, signature, nonce } to /api/auth/verify
 *  4. Receive a JWT — store it in sessionStorage (not localStorage, so it
 *     does not persist across browser sessions)
 *  5. Use that JWT for all Supabase calls (makeSupabaseClient(token))
 *
 * Security notes:
 * - We never trust a user-supplied address claim; the server recovers the
 *   signer address from the signature and compares it to the wallet param.
 * - Nonces are single-use and expire in 5 minutes.
 * - The JWT binds the session to a verified wallet address.
 * - Domain binding is enforced server-side (APP_DOMAIN in the SIWE message).
 */

import { type WalletClient } from 'viem'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSupabaseClient } from './supabase'

const SESSION_KEY = 'loanbook:auth_token'
const SESSION_WALLET_KEY = 'loanbook:auth_wallet'

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthSession {
  token: string
  wallet: string
  client: SupabaseClient
}

// ── Helpers ────────────────────────────────────────────────────────────────

function saveSession(token: string, wallet: string): void {
  sessionStorage.setItem(SESSION_KEY, token)
  sessionStorage.setItem(SESSION_WALLET_KEY, wallet.toLowerCase())
}

export function loadSession(): { token: string; wallet: string } | null {
  const token  = sessionStorage.getItem(SESSION_KEY)
  const wallet = sessionStorage.getItem(SESSION_WALLET_KEY)
  if (!token || !wallet) return null
  // Basic expiry check — decode the payload (no verify, server verifies)
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    if (payload.exp && payload.exp < Date.now() / 1000) {
      clearSession()
      return null
    }
  } catch {
    return null
  }
  return { token, wallet }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_WALLET_KEY)
}

export function getAuthClient(): ReturnType<typeof makeSupabaseClient> {
  const s = loadSession()
  if (!s) return null
  return makeSupabaseClient(s.token)
}

// ── Auth flow ──────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthError' }
}

/**
 * Full sign-in flow. Calls the auth server, prompts wallet signature,
 * verifies with server, stores session, returns AuthSession.
 *
 * @param wallet  - lowercase 0x address (from useAccount)
 * @param signMessage - async function that signs a message with the wallet
 */
export async function signIn(
  wallet: string,
  signMessage: (message: string) => Promise<string>,
): Promise<AuthSession> {
  const norm = wallet.toLowerCase()

  // Step 1 — Get nonce
  const nonceRes = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: norm }),
  })
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({})) as { error?: string }
    throw new AuthError(err.error ?? 'Failed to get nonce')
  }
  const { nonce, message } = await nonceRes.json() as { nonce: string; message: string }

  // Step 2 — Sign message
  let signature: string
  try {
    signature = await signMessage(message)
  } catch {
    throw new AuthError('Wallet signature cancelled or failed')
  }

  // Step 3 — Verify
  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: norm, signature, nonce }),
  })
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({})) as { error?: string }
    throw new AuthError(err.error ?? 'Signature verification failed')
  }
  const { token } = await verifyRes.json() as { token: string }

  saveSession(token, norm)

  const client = makeSupabaseClient(token)
  if (!client) throw new AuthError('Supabase not configured')

  return { token, wallet: norm, client }
}

/** Sign out: clear local session */
export function signOut(): void {
  clearSession()
}

// ── wagmi adapter ─────────────────────────────────────────────────────────

/**
 * Helper used by the useAuth hook to sign a message via wagmi's
 * useSignMessage hook result.
 */
export function makeWagmiSigner(
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): (message: string) => Promise<string> {
  return (message: string) => signMessageAsync({ message })
}

// For direct viem WalletClient usage (e.g. testing)
export function makeViemSigner(
  walletClient: WalletClient,
  account: `0x${string}`,
): (message: string) => Promise<string> {
  return (message: string) =>
    walletClient.signMessage({ account, message })
}
