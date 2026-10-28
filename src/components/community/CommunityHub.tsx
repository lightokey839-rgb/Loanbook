/**
 * CommunityHub — three-column layout: groups | chat+requests | members.
 * Collapses to a single-column mobile layout with navigation.
 * When Supabase is not configured, shows an attractive setup wizard.
 */
import { useState } from 'react'
import { ChevronLeft, Users, Database, Terminal, Key, Server, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Group } from '../../lib/supabase'
import type { AuthState } from '../../lib/useAuth'
import { GroupList } from './GroupList'
import { GroupView } from './GroupView'
import { MemberList } from './MemberList'
import { AuthGate } from './AuthGate'

interface Props {
  auth: AuthState
  onLoanCreated: (loanId: bigint) => void
}

// Graceful configuration guard (LB-010)
const SUPABASE_CONFIGURED = Boolean(import.meta.env.VITE_SUPABASE_URL)

export function CommunityHub({ auth, onLoanCreated }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  // Mobile: which column is visible
  const [mobileView, setMobileView] = useState<'groups' | 'chat' | 'members'>('groups')

  if (!SUPABASE_CONFIGURED) {
    return <SupabaseSetupWizard />
  }

  const wallet = auth.session?.wallet ?? ''
  const client = auth.client

  if (!client || !auth.session) {
    return <AuthGate auth={auth}>{null}</AuthGate>
  }

  function handleSelectGroup(g: Group) {
    setSelectedGroup(g)
    setMobileView('chat')
  }

  return (
    <AuthGate auth={auth}>
      {/* Outer container: full-height, three-column desktop */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', minHeight: '600px' }}
      >
        {/* ── Desktop: flex row ─────────────────────────────────────── */}
        <div className="hidden md:flex h-full" style={{ minHeight: '600px' }}>
          {/* Column 1: Groups */}
          <div className="w-48 border-r flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
            <GroupList
              wallet={wallet}
              client={client}
              selectedGroupId={selectedGroup?.id ?? null}
              onSelectGroup={handleSelectGroup}
            />
          </div>

          {/* Column 2: Chat / Requests */}
          <div className="flex-1 overflow-hidden">
            {selectedGroup ? (
              <GroupView
                group={selectedGroup}
                wallet={wallet}
                client={client}
                onLoanCreated={onLoanCreated}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(59,130,246,0.1)' }}
                >
                  <Users size={20} style={{ color: 'var(--color-accent-light)' }} />
                </div>
                <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
                  Select a group to start chatting<br />or create / join one on the left.
                </p>
              </div>
            )}
          </div>

          {/* Column 3: Members */}
          <div className="w-44 border-l flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
            {selectedGroup ? (
              <MemberList group={selectedGroup} wallet={wallet} client={client} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-center px-2" style={{ color: 'var(--color-muted)' }}>
                  Select a group to see members.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile: single column with nav ───────────────────────── */}
        <div className="md:hidden flex flex-col" style={{ minHeight: '560px' }}>
          {/* Mobile nav bar */}
          {selectedGroup && (
            <div
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                onClick={() => { if (mobileView === 'groups') setSelectedGroup(null); else setMobileView('groups') }}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--color-muted)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold flex-1 truncate">{selectedGroup.name}</span>
              <button
                onClick={() => setMobileView(v => v === 'members' ? 'chat' : 'members')}
                className="p-1.5 rounded-lg text-xs"
                style={{
                  background: mobileView === 'members' ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: mobileView === 'members' ? 'var(--color-accent-light)' : 'var(--color-muted)',
                }}
              >
                <Users size={14} />
              </button>
            </div>
          )}

          {/* Mobile content */}
          <div className="flex-1 overflow-hidden">
            {(mobileView === 'groups' || !selectedGroup) && (
              <GroupList
                wallet={wallet}
                client={client}
                selectedGroupId={selectedGroup?.id ?? null}
                onSelectGroup={handleSelectGroup}
              />
            )}
            {mobileView === 'chat' && selectedGroup && (
              <GroupView
                group={selectedGroup}
                wallet={wallet}
                client={client}
                onLoanCreated={onLoanCreated}
              />
            )}
            {mobileView === 'members' && selectedGroup && (
              <MemberList group={selectedGroup} wallet={wallet} client={client} />
            )}
          </div>
        </div>
      </div>

      {/* Auth footer */}
      <div className="flex items-center justify-between text-xs px-1 pt-1" style={{ color: 'var(--color-muted)' }}>
        <span>Signed in as <span className="mono text-white">{wallet.slice(0,6)}…{wallet.slice(-4)}</span></span>
        <button
          onClick={auth.signOut}
          className="hover:underline"
          style={{ color: 'var(--color-muted)' }}
        >
          Sign out
        </button>
      </div>
    </AuthGate>
  )
}

// ─── Supabase setup wizard ────────────────────────────────────────────────

interface SetupStep {
  icon: React.ReactNode
  title: string
  detail: string
  code?: string
}

const SETUP_STEPS: SetupStep[] = [
  {
    icon: <Database size={16} />,
    title: 'Create a Supabase project',
    detail: 'Go to supabase.com, create a free project, and note your project URL and API keys.',
  },
  {
    icon: <Terminal size={16} />,
    title: 'Run the database migration',
    detail: 'Open the Supabase SQL editor and paste the contents of:',
    code: 'supabase/migrations/001_loanbook_schema.sql',
  },
  {
    icon: <Key size={16} />,
    title: 'Set environment variables',
    detail: 'Copy .env.example to .env and fill in your Supabase credentials.',
    code: 'cp .env.example .env',
  },
  {
    icon: <Server size={16} />,
    title: 'Start the auth server',
    detail: 'Run the auth server alongside the dev server to enable wallet-signature login.',
    code: 'bun run server:auth',
  },
]

function SupabaseSetupWizard() {
  return (
    <div className="max-w-xl mx-auto py-8 px-2 space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(34,211,238,0.15) 100%)',
            border: '1px solid rgba(59,130,246,0.3)',
          }}
        >
          <Users size={24} style={{ color: 'var(--accent-light)' }} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.02em' }}>
            Set up your first lending circle
          </h2>
          <p className="text-sm mt-2 text-pretty max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
            Communities need a Supabase project for private group storage, realtime chat, and wallet-signature authentication.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {SETUP_STEPS.map((step, i) => (
          <div
            key={i}
            className="card p-4 flex items-start gap-4"
            style={{ background: 'var(--bg-card)' }}
          >
            {/* Step number */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
              >
                {step.icon}
              </div>
              {i < SETUP_STEPS.length - 1 && (
                <div className="w-px h-4" style={{ background: 'var(--border-strong)' }} />
              )}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
                  Step {i + 1}
                </span>
              </div>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>{step.title}</p>
              <p className="text-xs mt-1 text-pretty" style={{ color: 'var(--muted)' }}>{step.detail}</p>
              {step.code && (
                <code
                  className="mono text-xs mt-2 inline-block px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--cyan)', border: '1px solid var(--border)' }}
                >
                  {step.code}
                </code>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Verification note */}
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.15)' }}
      >
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--green)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>Verify connection</p>
          <p className="text-xs mt-1 text-pretty" style={{ color: 'rgba(34,197,94,0.75)' }}>
            Once all four steps are complete and both servers are running, reload this page.
            The Communities tab will activate and let you create or join a lending circle.
          </p>
        </div>
      </div>

      {/* Full guide link */}
      <div className="text-center">
        <a
          href="docs/SUPABASE_SETUP.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--accent-light)', opacity: 0.8 }}
        >
          Full setup guide
          <ArrowRight size={13} />
        </a>
        <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
          Overview, My Loans, and Direct Loan work without Supabase.
        </p>
      </div>
    </div>
  )
}
