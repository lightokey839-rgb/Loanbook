/**
 * OverviewPage — dashboard home with stats, quick actions, and empty states.
 * Uses only real onchain data. Never fabricates balances or transactions.
 */
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  ArrowUpRight, ArrowDownLeft, Banknote, Clock, Users,
  BookOpen, TrendingUp, AlertTriangle, CheckCircle2,
  ExternalLink, Plus,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, shortAddr, formatUsdc, parseLoan } from '../loanbook-contract'
import { LoanState } from '../loanbook-contract'
import { getUsdc, buildAddressExplorerUrl } from '../onchain-facts'
import type { Page } from './AppShell'

const USDC = getUsdc(arcTestnet.id)!

interface Props {
  onNavigate: (p: Page) => void
  onRequestLoan: () => void
}

function StatCard({ label, value, sub, icon, accent = false }: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      className="card p-5 space-y-3 fade-up"
      style={{ background: accent ? 'rgba(59,130,246,0.07)' : 'var(--bg-card)', borderColor: accent ? 'rgba(59,130,246,0.2)' : 'var(--border)' }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)' }}
        >
          <span style={{ color: accent ? 'var(--accent-light)' : 'var(--muted)' }}>{icon}</span>
        </div>
      </div>
      <div>
        <div
          className="text-2xl font-bold tabular-nums"
          style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.025em', color: accent ? 'var(--accent-light)' : 'var(--ink)' }}
        >
          {value}
        </div>
        <div className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{label}</div>
        {sub && <div className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function QuickAction({ label, desc, icon, onClick, primary = false }: {
  label: string
  desc: string
  icon: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="card p-4 text-left w-full transition-all hover:scale-[1.01] active:scale-[0.99] fade-up"
      style={{
        background: primary ? 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(34,211,238,0.08) 100%)' : 'var(--bg-card)',
        borderColor: primary ? 'rgba(59,130,246,0.25)' : 'var(--border)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: primary ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)' }}
        >
          <span style={{ color: primary ? 'var(--accent-light)' : 'var(--muted)' }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: primary ? 'var(--accent-light)' : 'var(--ink)' }}>
            {label}
          </div>
          <div className="text-xs mt-0.5 text-balance" style={{ color: 'var(--muted)' }}>{desc}</div>
        </div>
        <ArrowUpRight size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />
      </div>
    </button>
  )
}

function HowItWorksStep({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)', fontFamily: 'Space Grotesk' }}
      >
        {n}
      </div>
      <p className="text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>{text}</p>
    </div>
  )
}

export function OverviewPage({ onNavigate, onRequestLoan }: Props) {
  const { address, isConnected } = useAccount()

  // USDC ERC-20 balance
  const { data: erc20Balance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: arcTestnet.id,
    query: { enabled: isConnected && !!address, refetchInterval: 8000 },
  })

  // Total loan count
  const { data: loanCount } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'loanCount',
    chainId: arcTestnet.id,
    query: { refetchInterval: 12000 },
  })

  // Load the last few loans to count user's active/pending ones
  // We read up to 10 most recent loans for the connected address
  const recentIds: bigint[] = loanCount
    ? Array.from({ length: Math.min(Number(loanCount), 10) }, (_, i) => loanCount - BigInt(i))
    : []

  const { data: recentLoansRaw } = useReadContracts({
    contracts: recentIds.map(id => ({
      address: LOANBOOK_ADDRESS as `0x${string}`,
      abi: LOANBOOK_ABI,
      functionName: 'getLoan' as const,
      args: [id] as [bigint],
      chainId: arcTestnet.id,
    })),
    query: { enabled: recentIds.length > 0 && isConnected && !!address },
  })

  // Parse results
  const myLoans = (recentLoansRaw ?? [])
    .map((r, i) => {
      if (r.status !== 'success' || !r.result) return null
      const loan = parseLoan(r.result)
      const id = recentIds[i]
      const isMine = address &&
        (loan.borrower.toLowerCase() === address.toLowerCase() ||
          loan.lender.toLowerCase() === address.toLowerCase())
      return isMine ? { id, loan } : null
    })
    .filter((x): x is { id: bigint; loan: ReturnType<typeof parseLoan> } => x !== null)

  const activeBorrowed = myLoans.filter(
    x => x.loan.borrower.toLowerCase() === address?.toLowerCase() && x.loan.state === (LoanState.Funded as number)
  ).length

  const activeLent = myLoans.filter(
    x => x.loan.lender.toLowerCase() === address?.toLowerCase() && x.loan.state === (LoanState.Funded as number)
  ).length

  const openRequests = myLoans.filter(x => x.loan.state === (LoanState.Open as number)).length

  const usdcDisplay = erc20Balance !== undefined
    ? (Number(erc20Balance) / 1_000_000).toFixed(2)
    : '—'

  if (!isConnected) {
    return <LandingView onRequestLoan={onRequestLoan} />
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20 md:pb-6">
      {/* Hero greeting */}
      <div className="fade-up">
        <h2
          className="text-2xl md:text-3xl font-bold text-balance"
          style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.025em' }}
        >
          Your circle.{' '}
          <span style={{ color: 'var(--accent-light)' }}>Your loans.</span>{' '}
          Your terms.
        </h2>
        <p className="text-sm mt-2 text-pretty" style={{ color: 'var(--muted)' }}>
          Borrow and lend USDC with people you trust, powered by Arc.
          {' '}
          <span style={{ color: 'var(--subtle)' }}>
            Blockchain records are public. Repayment is not guaranteed.
          </span>
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="USDC Balance"
          value={usdcDisplay}
          sub="ERC-20, 6 decimals"
          icon={<Banknote size={18} />}
          accent
        />
        <StatCard
          label="Active Loans"
          value={String(activeBorrowed + activeLent)}
          sub={activeBorrowed > 0 ? `${activeBorrowed} borrowed` : undefined}
          icon={<BookOpen size={18} />}
        />
        <StatCard
          label="Open Requests"
          value={String(openRequests)}
          sub="Waiting for lender"
          icon={<Clock size={18} />}
        />
        <StatCard
          label="Total Onchain"
          value={loanCount !== undefined ? loanCount.toString() : '—'}
          sub="LoanBook agreements"
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickAction
            label="Request a Loan"
            desc="Post to your circle. No gas needed."
            icon={<Plus size={18} />}
            onClick={onRequestLoan}
            primary
          />
          <QuickAction
            label="Communities"
            desc="Join or create a lending circle."
            icon={<Users size={18} />}
            onClick={() => onNavigate('communities')}
          />
          <QuickAction
            label="My Loans"
            desc="Fund, repay, and track loans."
            icon={<BookOpen size={18} />}
            onClick={() => onNavigate('my-loans')}
          />
        </div>
      </div>

      {/* Recent activity */}
      {myLoans.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
              Your Recent Loans
            </h3>
            <button
              onClick={() => onNavigate('my-loans')}
              className="text-xs flex items-center gap-1 transition-colors hover:opacity-100"
              style={{ color: 'var(--accent-light)', opacity: 0.7 }}
            >
              View all <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {myLoans.slice(0, 5).map(({ id, loan }) => {
              const isBorrower = address && loan.borrower.toLowerCase() === address.toLowerCase()
              const stateLabel = [' Open', 'Funded', 'Repaid', 'Cancelled'][loan.state] ?? 'Unknown'
              const stateClass = ['status-open', 'status-funded', 'status-repaid', 'status-cancelled'][loan.state] ?? ''
              return (
                <div
                  key={id.toString()}
                  className="card px-4 py-3 flex items-center gap-3 fade-up"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isBorrower ? 'var(--amber-dim)' : 'var(--cyan-dim)' }}
                  >
                    {isBorrower
                      ? <ArrowDownLeft size={14} style={{ color: 'var(--amber)' }} />
                      : <ArrowUpRight size={14} style={{ color: 'var(--cyan)' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Loan #{id.toString()} — {isBorrower ? 'Borrowing' : 'Lending'}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      with {shortAddr(isBorrower ? loan.lender : loan.borrower)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatUsdc(loan.amount)} USDC
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateClass}`}>
                      {stateLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-pretty"
        style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.18)' }}
      >
        <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
        <div style={{ color: 'rgba(245,158,11,0.9)' }}>
          <strong>Unsecured loans.</strong> LoanBook records agreements onchain and facilitates USDC transfers.
          It cannot enforce repayment or recover funds from defaulting borrowers.
          Only lend to people you trust.
        </div>
      </div>
    </div>
  )
}

/** Landing view shown when wallet is not connected */
function LandingView({ onRequestLoan }: { onRequestLoan: () => void }) {
  void onRequestLoan
  return (
    <div className="max-w-2xl mx-auto pt-6 pb-20 md:pb-6 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4 fade-up pt-4">
        <div
          className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #22D3EE 100%)',
            fontFamily: 'Space Grotesk',
            color: '#fff',
            boxShadow: '0 8px 32px rgba(59,130,246,0.45)',
          }}
        >
          L
        </div>
        <div>
          <h1
            className="text-3xl md:text-4xl font-bold text-balance"
            style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.03em' }}
          >
            Borrow from your circle.
            <br />
            <span style={{ color: 'var(--accent-light)' }}>Repay on Arc.</span>
          </h1>
          <p className="text-base mt-3 text-pretty max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            Private lending communities, transparent USDC agreements, and verifiable repayments.
          </p>
        </div>
        <div className="flex justify-center">
          <ConnectKitButton />
        </div>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Get test USDC from the <strong className="text-white">Get test USDC</strong> button in the sidebar.
        </p>
      </div>

      {/* How it works */}
      <div className="card p-6 space-y-4 fade-up">
        <h3 className="text-base font-semibold flex items-center gap-2" style={{ fontFamily: 'Space Grotesk' }}>
          <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
          How it works
        </h3>
        <div className="space-y-4">
          <HowItWorksStep n={1} text="Connect your wallet and join a private lending circle." />
          <HowItWorksStep n={2} text="Post a loan request — zero gas, no lender address needed." />
          <HowItWorksStep n={3} text="Circle members click 'I'm Interested' to offer their USDC." />
          <HowItWorksStep n={4} text="Choose a lender and create the onchain agreement." />
          <HowItWorksStep n={5} text="Lender approves USDC and funds — transfers directly to you." />
          <HowItWorksStep n={6} text="You repay on time — USDC goes straight back to the lender." />
        </div>
        <div
          className="rounded-xl px-4 py-3 text-xs flex items-start gap-2 text-pretty"
          style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.15)', color: 'rgba(245,158,11,0.85)' }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Loans are unsecured. Only lend to people you trust. Onchain records are public.
        </div>
      </div>

      {/* Contract link */}
      <div className="text-center space-y-1 text-xs fade-up" style={{ color: 'var(--subtle)' }}>
        <p>
          Contract:{' '}
          <a
            href={buildAddressExplorerUrl(arcTestnet.id, LOANBOOK_ADDRESS)}
            target="_blank" rel="noopener noreferrer"
            className="mono hover:text-white transition-colors"
          >
            {shortAddr(LOANBOOK_ADDRESS)} <ExternalLink size={9} className="inline" />
          </a>
          {' · '}Chain ID: <span className="mono">5042002</span>
        </p>
      </div>
    </div>
  )
}
