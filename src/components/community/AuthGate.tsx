/**
 * AuthGate — shows wallet-sig sign-in prompt when the user is not authenticated.
 * Wraps the entire community section.
 */
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import type { AuthState } from '../../lib/useAuth'

interface Props {
  auth: AuthState
  children: React.ReactNode
}

export function AuthGate({ auth, children }: Props) {
  const isSupabaseConfigured =
    !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!isSupabaseConfigured) {
    return (
      <div className="glass p-6 space-y-3 text-center">
        <AlertCircle size={28} className="mx-auto" style={{ color: 'var(--color-yellow)' }} />
        <h3 className="font-semibold text-sm">Supabase not configured</h3>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Private groups require a Supabase backend. Set{' '}
          <span className="mono text-white">VITE_SUPABASE_URL</span> and{' '}
          <span className="mono text-white">VITE_SUPABASE_ANON_KEY</span> in{' '}
          <span className="mono text-white">.env</span>.
        </p>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          See <span className="mono text-white">docs/SUPABASE_SETUP.md</span> for step-by-step instructions.
        </p>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          The loan creation and funding flow (Direct + Fund/Repay tabs) still works without Supabase.
        </p>
      </div>
    )
  }

  if (auth.status === 'authenticated') {
    return <>{children}</>
  }

  return (
    <div className="glass p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} style={{ color: 'var(--color-accent-light)' }} />
        <h3 className="font-semibold text-sm">Sign in to access communities</h3>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        LoanBook verifies your wallet ownership with a message signature. This does not cost gas and
        does not authorize any transfer.
      </p>

      {auth.error && (
        <div
          className="text-xs rounded-lg px-3 py-2"
          style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}
        >
          {auth.error}
        </div>
      )}

      <button
        onClick={() => { void auth.signIn() }}
        disabled={auth.status === 'signing' || auth.status === 'verifying'}
        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ background: 'var(--color-accent)', color: '#fff' }}
      >
        {auth.status === 'signing' && (
          <><Loader2 size={14} className="animate-spin" />Check your wallet…</>
        )}
        {auth.status === 'verifying' && (
          <><Loader2 size={14} className="animate-spin" />Verifying…</>
        )}
        {(auth.status === 'idle' || auth.status === 'error') && (
          <><ShieldCheck size={14} />Sign in with wallet</>
        )}
      </button>

      <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
        Your signature proves wallet ownership. No private key is ever shared.
      </p>
    </div>
  )
}
