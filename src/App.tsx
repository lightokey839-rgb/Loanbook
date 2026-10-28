/**
 * App — root component wiring the AppShell to all pages.
 * Navigation is purely client-side state; no router library needed.
 */
import { useState, useCallback } from 'react'
import { AppShell, type Page } from './components/AppShell'
import { NetworkGuard } from './components/NetworkGuard'
import { OverviewPage } from './components/OverviewPage'
import { MyLoansPage } from './components/MyLoansPage'
import { CommunityHub } from './components/community/CommunityHub'
import { LoanRequestPanel } from './components/LoanRequestPanel'
import { CreateLoanPanel } from './components/CreateLoanPanel'
import { LookupPanel } from './components/LookupPanel'
import { useAuth } from './lib/useAuth'
import { Activity, Settings, Zap } from 'lucide-react'

const PAGE_TITLES: Record<Page, string> = {
  'overview':     'Overview',
  'communities':  'Communities',
  'my-loans':     'My Loans',
  'activity':     'Activity',
  'direct':       'Direct Loan',
  'lookup':       'Fund / Repay',
  'settings':     'Settings',
}

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [justCreatedId, setJustCreatedId] = useState<bigint | null>(null)
  const auth = useAuth()

  const handleLoanCreated = useCallback((loanId: bigint) => {
    setJustCreatedId(loanId)
    setPage('lookup')
  }, [])

  const handleRequestLoan = useCallback(() => {
    setPage('communities')
  }, [])

  function renderPage() {
    switch (page) {
      case 'overview':
        return (
          <OverviewPage
            onNavigate={setPage}
            onRequestLoan={handleRequestLoan}
          />
        )

      case 'communities':
        return (
          <CommunityHub
            auth={auth}
            onLoanCreated={handleLoanCreated}
          />
        )

      case 'my-loans':
        return <MyLoansPage onNavigate={setPage} />

      case 'activity':
        return (
          <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
            <Activity size={32} className="mx-auto" style={{ color: 'var(--muted)' }} />
            <h3 className="text-lg font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Activity</h3>
            <p className="text-sm text-pretty max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
              A live feed of onchain LoanBook events is coming soon.
              For now, use the Arc Explorer to see all contract transactions.
            </p>
            <a
              href="https://explorer.testnet.arc.io/address/0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: 'var(--accent-light)' }}
            >
              View on Arc Explorer
            </a>
          </div>
        )

      case 'direct':
        return (
          <div className="max-w-lg mx-auto space-y-4">
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.9)' }}
            >
              <div className="flex items-center gap-2">
                <Zap size={14} />
                <strong>Advanced / Direct Loan</strong>
              </div>
              <p className="text-xs mt-1" style={{ color: 'rgba(245,158,11,0.75)' }}>
                Enter the lender address directly and pay gas immediately.
                For community social flow, use the Communities tab.
              </p>
            </div>
            <CreateLoanPanel onCreated={handleLoanCreated} />
          </div>
        )

      case 'lookup':
        return (
          <div className="max-w-lg mx-auto">
            <LookupPanel defaultLoanId={justCreatedId ?? undefined} />
          </div>
        )

      case 'settings':
        return (
          <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
            <Settings size={32} className="mx-auto" style={{ color: 'var(--muted)' }} />
            <h3 className="text-lg font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Settings</h3>
            <p className="text-sm max-w-xs mx-auto text-pretty" style={{ color: 'var(--muted)' }}>
              Settings panel coming soon. Use the Get test USDC button in the Arc Studio sidebar for testnet funds.
            </p>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <NetworkGuard>
      <AppShell
        page={page}
        onNavigate={setPage}
        onRequestLoan={handleRequestLoan}
        pageTitle={PAGE_TITLES[page]}
      >
        {/* Community page gets wider layout; others are narrower — handled inside each page */}
        {renderPage()}

        {/* Request Loan sheet — shown over current page */}
        {page === 'communities' && false /* handled inside CommunityHub */ && (
          <LoanRequestPanel onCreated={handleLoanCreated} />
        )}
      </AppShell>
    </NetworkGuard>
  )
}
