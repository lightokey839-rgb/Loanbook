/**
 * useAuth — React hook wrapping the wallet-signature auth flow.
 *
 * Returns the current session (if any), a signIn function, and a signOut function.
 * The session is stored in sessionStorage so it survives page reloads but not
 * new browser sessions or private-browsing windows.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  signIn as authSignIn,
  signOut as authSignOut,
  loadSession,
  clearSession,
  makeWagmiSigner,
  type AuthSession,
  AuthError,
} from './auth'
import { makeSupabaseClient } from './supabase'

export type AuthStatus = 'idle' | 'signing' | 'verifying' | 'authenticated' | 'error'

export interface AuthState {
  status: AuthStatus
  session: AuthSession | null
  client: SupabaseClient | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

export function useAuth(): AuthState {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<AuthStatus>('idle')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore session from sessionStorage on mount / wallet change
  useEffect(() => {
    const saved = loadSession()
    if (saved && address && saved.wallet === address.toLowerCase()) {
      const client = makeSupabaseClient(saved.token)
      if (client) {
        setSession({ ...saved, client })
        setStatus('authenticated')
        return
      }
    }
    // Wallet changed or no saved session — clear
    if (session && address && session.wallet !== address.toLowerCase()) {
      clearSession()
      setSession(null)
      setStatus('idle')
    }
  // Only re-run when address changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const signIn = useCallback(async () => {
    if (!address) { setError('Connect your wallet first'); return }
    setError(null)
    setStatus('signing')
    try {
      const signer = makeWagmiSigner(signMessageAsync)
      setStatus('verifying')
      const sess = await authSignIn(address, signer)
      setSession(sess)
      setStatus('authenticated')
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : 'Sign-in failed'
      setError(msg)
      setStatus('error')
    }
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    authSignOut()
    setSession(null)
    setStatus('idle')
    setError(null)
  }, [])

  return {
    status,
    session,
    client: (session?.client ?? null),
    error,
    signIn,
    signOut,
  }
}
