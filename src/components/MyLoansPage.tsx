/**
 * MyLoansPage — tabbed loan management with timeline progress.
 * Only shows real onchain data; no fabricated state.
 */
import { useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { activeChain as arcTestnet } from '../network'
import {
  BookOpen, ArrowDownLeft, ArrowUpRight,
  XCircle, AlertTriangle, Search,
  RefreshCw,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import {
  LOANBOOK_ADDRESS, LOANBOOK_ABI, parseLoan, formatUsdc,
  shortAddr, formatTs, LoanState,
} from '../loanbook-contract'
import { buildAddressExplorerUrl } from '../onchain-facts'
import { LookupPanel } from './LookupPanel'
import type { Page } from './AppShell'

type Tab = 'all' | 'borrowed' | 'lent' | 'pending' | 'repaid'

interface Props {
  onNavigate: (p: Page) => void
}

/** Visual timeline for a loan's lifecycle */
function LoanTimeline({ state }: { state: number }) {
  const steps = [
    { label: 'Created', done: true },
    { label: 'Funded', done: state >= (LoanState.Funded as number) },
    { label: 'Repaid', done: state === (LoanState.Repaid as number) },
  ]
  if (state === (LoanState.Cancelled as number)) {
    return (
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <XCircle size={12} style={{ color: 'var(--red)' }} />
        Cancelled
      </div>
    )
  }
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center">
          {i > 0 && (
            <div
              className="h-px w-8"
              style={{ background: s.done ? 'var(--accent)' : 'var(--border-strong)' }}
            />
          )}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
              style={{
                borderColor: s.done ? 'var(--accent)' : 'var(--border-strong)',
                background: s.done ? 'var(--accent)' : 'transparent',
              }}
            >
              {s.done && <div className="w-1 h-1 rounded-full bg-white" />}
            </div>
            <span className="text-xs" style={{ color: s.done ? 'var(--ink-2)' : 'var(--subtle)', fontSize: '10px' }}>
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

interface LoanEntry {
  id: bigint
  loan: ReturnType<typeof parseLoan>
  overdue: boolean
}

function LoanEntryCard({ entry, address, onManage }: {
  entry: LoanEntry
  address: string
  onManage: (id: bigint) => void
}) {
  const { id, loan, overdue } = entry
  const isBorrower = loan.borrower.toLowerCase() === address.toLowerCase()
  const counterparty = isBorrower ? loan.lender : loan.borrower

  const stateClass = overdue && loan.state === (LoanState.Funded as number)
    ? 'status-overdue'
    : ['status-open', 'status-funded', 'status-repaid', 'status-cancelled'][loan.state] ?? ''
  const stateLabel = overdue && loan.state === (LoanState.Funded as number)
    ? 'Overdue'
    : ['Open', 'Funded', 'Repaid', 'Cancelled'][loan.state] ?? 'Unknown'

  const canAct = (isBorrower && loan.state === (LoanState.Funded as number)) ||
    (!isBorrower && loan.state === (LoanState.Open as number)) ||
    (isBorrower && loan.state === (LoanState.Open as number))

  return (
    <div className="card p-4 fade-up hover:border-white/10 transition-colors">
      <div className="flex items-start gap-3">
        {/* Role icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: isBorrower ? 'var(--amber-dim)' : 'var(--cyan-dim)' }}
        >
          {isBorrower
            ? <ArrowDownLeft size={16} style={{ color: 'var(--amber)' }} />
            : <ArrowUpRight size={16} style={{ color: 'var(--cyan)' }} />
          }
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
              Loan #{id.toString()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateClass}`}>
              {stateLabel}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-md font-medium"
              style={{
                background: isBorrower ? 'var(--amber-dim)' : 'var(--cyan-dim)',
                color: isBorrower ? 'var(--amber)' : 'var(--cyan)',
              }}
            >
              {isBorrower ? 'Borrower' : 'Lender'}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <div
              className="text-xl font-bold tabular-nums"
              style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.02em' }}
            >
              {formatUsdc(loan.amount)}{' '}
              <span className="text-sm font-semibold" style={{ color: 'var(--accent-light)' }}>USDC</span>
            </div>
          </div>

          <div className="mt-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              {isBorrower ? 'Lender' : 'Borrower'}:{' '}
              <a
                href={buildAddressExplorerUrl(arcTestnet.id, counterparty)}
                target="_blank" rel="noopener noreferrer"
                className="mono hover:underline"
                style={{ color: 'var(--ink-2)' }}
              >
                {shortAddr(counterparty)}
              </a>
            </div>
            <div className="flex items-center gap-3 flex-wrap" style={{ color: 'var(--muted)' }}>
              <span>Created {formatTs(loan.createdAt)}</span>
              {loan.state >= (LoanState.Funded as number) && loan.dueDate > 0n && (
                <span style={{ color: overdue ? 'var(--red)' : 'inherit' }}>
                  {overdue ? <AlertTriangle size={11} className="inline mr-0.5" /> : null}
                  Due {formatTs(loan.dueDate)}
                </span>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="mt-3">
            <LoanTimeline state={loan.state} />
          </div>
        </div>

        {/* Action button */}
        {canAct && (
          <button
            onClick={() => onManage(id)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all btn-primary"
          >
            Manage
          </button>
        )}
      </div>
    </div>
  )
}

export function MyLoansPage({ onNavigate: _onNavigate }: Props) {
  const { address, isConnected } = useAccount()
  const [scanLimit, setScanLimit] = useState(30)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [manageLoanId, setManageLoanId] = useState<bigint | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: loanCount, refetch: refetchCount } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'loanCount',
    chainId: arcTestnet.id,
    query: { refetchInterval: 12000 },
  })

  const recentIds: bigint[] = loanCount
    ? Array.from({ length: Math.min(Number(loanCount), scanLimit) }, (_, i) => loanCount - BigInt(i))
    : []

  const { data: loansRaw, refetch: refetchLoans } = useReadContracts({
    contracts: recentIds.map(id => ({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'getLoan' as const,
      args: [id] as [bigint],
      chainId: arcTestnet.id,
    })),
    query: { enabled: recentIds.length > 0 && isConnected && !!address },
  })

  const { data: overdueRaw } = useReadContracts({
    contracts: recentIds.map(id => ({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'isOverdue' as const,
      args: [id] as [bigint],
      chainId: arcTestnet.id,
    })),
    query: { enabled: recentIds.length > 0 && isConnected && !!address },
  })

  function handleRefresh() {
    setRefreshKey(k => k + 1)
    refetchCount().catch(() => {})
    refetchLoans().catch(() => {})
  }

  const allMyLoans: LoanEntry[] = (loansRaw ?? [])
    .map((r, i) => {
      if (r.status !== 'success' || !r.result) return null
      const loan = parseLoan(r.result)
      const id = recentIds[i]
      if (!address) return null
      const isMine =
        loan.borrower.toLowerCase() === address.toLowerCase() ||
        loan.lender.toLowerCase() === address.toLowerCase()
      if (!isMine) return null
      const overdue = overdueRaw?.[i]?.status === 'success'
        ? Boolean(overdueRaw[i].result)
        : false
      return { id, loan, overdue }
    })
    .filter((x): x is LoanEntry => x !== null)

  function filtered(tab: Tab): LoanEntry[] {
    if (!address) return []
    switch (tab) {
      case 'borrowed': return allMyLoans.filter(x => x.loan.borrower.toLowerCase() === address.toLowerCase())
      case 'lent':     return allMyLoans.filter(x => x.loan.lender.toLowerCase() === address.toLowerCase())
      case 'pending':  return allMyLoans.filter(x => x.loan.state === (LoanState.Open as number))
      case 'repaid':   return allMyLoans.filter(x => x.loan.state === (LoanState.Repaid as number))
      default:         return allMyLoans
    }
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'all',     label: 'All',     count: allMyLoans.length },
    { id: 'borrowed',label: 'Borrowed',count: allMyLoans.filter(x => x.loan.borrower.toLowerCase() === (address ?? '').toLowerCase()).length },
    { id: 'lent',    label: 'Lent',    count: allMyLoans.filter(x => x.loan.lender.toLowerCase() === (address ?? '').toLowerCase()).length },
    { id: 'pending', label: 'Pending', count: allMyLoans.filter(x => x.loan.state === (LoanState.Open as number)).length },
    { id: 'repaid',  label: 'Repaid',  count: allMyLoans.filter(x => x.loan.state === (LoanState.Repaid as number)).length },
  ]

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <BookOpen size={32} style={{ color: 'var(--muted)' }} />
        <h3 className="text-lg font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Connect your wallet</h3>
        <p className="text-sm max-w-xs text-pretty" style={{ color: 'var(--muted)' }}>
          Connect your wallet to see your loans and manage repayments.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  const displayList = filtered(activeTab)

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20 md:pb-6" key={refreshKey}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.02em' }}>
            My Loans
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {allMyLoans.length} loans found in the last {recentIds.length} onchain records.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 rounded-xl btn-ghost"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loanCount && BigInt(scanLimit) < loanCount ? <button className="btn-secondary" onClick={() => setScanLimit(v => v + 30)}>Load older loans (scanned {scanLimit} most recent)</button> : null}
      {/* Tabs */}
      <div
        className="flex rounded-xl p-1 gap-0.5 overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === t.id ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activeTab === t.id ? 'var(--accent-light)' : 'var(--muted)',
            }}
          >
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: activeTab === t.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)',
                  color: activeTab === t.id ? 'var(--accent-light)' : 'var(--muted)',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loan list */}
      {displayList.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <BookOpen size={28} style={{ color: 'var(--muted)' }} className="mx-auto" />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {activeTab === 'all'
              ? 'No loans found in your recent onchain history.'
              : `No ${activeTab} loans found.`}
          </p>
          {activeTab === 'all' && (
            <p className="text-xs text-pretty max-w-xs mx-auto" style={{ color: 'var(--subtle)' }}>
              Use Communities to post a request or use Direct Loan to create one with a known lender address.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map(entry => (
            <LoanEntryCard
              key={entry.id.toString()}
              entry={entry}
              address={address!}
              onManage={id => setManageLoanId(id)}
            />
          ))}
        </div>
      )}

      {/* Manage loan modal panel */}
      {manageLoanId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
          style={{ background: 'rgba(8,13,27,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setManageLoanId(null) }}
        >
          <div
            className="card w-full max-w-lg max-h-[85dvh] overflow-y-auto"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk' }}>
                Manage Loan #{manageLoanId.toString()}
              </h3>
              <button
                onClick={() => setManageLoanId(null)}
                className="p-1.5 rounded-lg btn-ghost text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <LookupPanel defaultLoanId={manageLoanId} />
            </div>
          </div>
        </div>
      )}

      {/* Advanced / Direct section */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={14} style={{ color: 'var(--muted)' }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
            Look up any loan by ID
          </h3>
        </div>
        <LookupPanel />
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
        Loan records are public onchain. Repayment is not guaranteed. Only lend to people you trust.
      </p>
    </div>
  )
}

