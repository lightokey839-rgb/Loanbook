import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signIn as authenticate, signOut as endSession, restoreSession, verifiedWallet, type AuthSession } from './auth'
import { getSupabaseClient } from './supabase'
export type AuthStatus = 'idle' | 'signing' | 'verifying' | 'authenticated' | 'error'
export interface AuthState {
  status: AuthStatus; session: AuthSession | null; client: SupabaseClient | null;
  wallet: string | null; error: string | null; signIn: () => Promise<void>; signOut: () => void;
}
export function useAuth(): AuthState {
  const { address, status: connection } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const busy = useRef(false)
  useEffect(() => {
    const version = ++generation.current
    let active = true
    // Synchronize React state with the external wallet identity and connection.
    // oxlint-disable-next-line react/set-state-in-effect
    setSession(null); setStatus('idle'); setError(null)
    if (connection === 'reconnecting' || connection === 'connecting') return
    if (!address) { void endSession(); return }
    void restoreSession(address).then(restored => {
      if (active && version === generation.current && !busy.current && restored) {
        setSession(restored); setStatus('authenticated')
      }
    }).catch(() => { /* AuthGate offers a fresh signature after a failed restore. */ })
    const client = getSupabaseClient()
    const subscription = client?.auth.onAuthStateChange((event, next) => {
      // Do not await Supabase calls here: the SDK holds its auth lock.
      if (!active || busy.current || event === 'INITIAL_SESSION') return
      if (!next || verifiedWallet(next.user) !== address.toLowerCase()) {
        setSession(null); setStatus('idle')
      } else if (client) {
        setSession({ wallet: address.toLowerCase(), userId: next.user.id, client }); setStatus('authenticated')
      }
    }).data.subscription
    return () => { active = false; generation.current = version + 1; subscription?.unsubscribe() }
  }, [address, connection])
  const signIn = useCallback(async () => {
    if (busy.current) return
    if (!address || !walletClient) { setError('Connect and unlock your wallet first.'); return }
    const version = generation.current
    busy.current = true; setError(null); setStatus('signing')
    try {
      const next = await authenticate(address, walletClient, () => version === generation.current)
      if (version !== generation.current) return
      const { error: profileError } = await next.client.rpc('upsert_my_profile')
      if (profileError) throw new Error('Wallet verified, but your community profile could not load. Check database setup and retry.')
      if (version === generation.current) { setSession(next); setStatus('authenticated') }
    } catch (e) {
      if (version === generation.current) { setSession(null); setError(e instanceof Error ? e.message : 'Sign-in failed'); setStatus('error') }
    } finally { busy.current = false }
  }, [address, walletClient])
  const signOut = useCallback(() => {
    generation.current++; setSession(null); setStatus('idle'); setError(null); void endSession()
  }, [])
  const visible = address && session?.wallet === address.toLowerCase() ? session : null
  return { status: status === 'authenticated' && !visible ? 'idle' : status, session: visible,
    client: visible?.client ?? getSupabaseClient(), wallet: visible?.wallet ?? null, error, signIn, signOut }
}
