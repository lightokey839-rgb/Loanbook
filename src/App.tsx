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
import { currentInvite } from './lib/invites'
import { ActivityPage } from './components/ActivityPage'
import { activeChain, contractAddress, explorerUrl } from './network'
import { CreateLoanPanel } from './components/CreateLoanPanel'
import { LookupPanel } from './components/LookupPanel'
import { useAuth } from './lib/useAuth'
import { Zap } from 'lucide-react'

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
  const [page, setPage] = useState<Page>(() => currentInvite() ? 'communities' : 'overview')
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
            key={auth.wallet ?? 'signed-out'}
            auth={auth}
            onLoanCreated={handleLoanCreated}
          />
        )

      case 'my-loans':
        return <MyLoansPage onNavigate={setPage} />

      case 'activity':
        return <ActivityPage />

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
        return <div className="card p-6 space-y-4 max-w-xl"><h2 className="text-lg font-semibold">Network & privacy</h2><p>{activeChain.name} · Chain {activeChain.id}</p><a className="text-sm break-all underline" href={explorerUrl + '/address/' + contractAddress} target="_blank" rel="noreferrer">View LoanBook contract</a><p className="text-sm">Communities use wallet signatures to protect conversations. Loan amounts, counterparties and transactions are public on Arc. Loans are unsecured, zero interest, and have no guaranteed repayment.</p><button className="btn-secondary" onClick={auth.signOut}>Sign out of communities</button></div>

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


      </AppShell>
    </NetworkGuard>
  )
}
