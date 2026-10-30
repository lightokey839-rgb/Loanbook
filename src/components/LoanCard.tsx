import { useReadContract } from 'wagmi'
import { activeChain as arcTestnet } from '../network'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, LoanData, formatUsdc, formatTs, shortAddr, parseLoan } from '../loanbook-contract'
import { LoanStatusBadge } from './LoanStatusBadge'
import { buildAddressExplorerUrl } from '../onchain-facts'

interface Props {
  loanId: bigint
  highlightAddress?: string
}

const SECONDS_PER_DAY = 86400n

export function LoanCard({ loanId, highlightAddress }: Props) {
  const { data: rawLoan, isLoading } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'getLoan',
    args: [loanId],
    chainId: arcTestnet.id,
  })

  const { data: overdue } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'isOverdue',
    args: [loanId],
    chainId: arcTestnet.id,
  })

  if (isLoading) {
    return (
      <div className="glass p-5 animate-pulse">
        <div className="h-4 rounded w-1/3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    )
  }

  if (!rawLoan) {
    return (
      <div className="glass p-5 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
        Loan #{loanId.toString()} not found.
      </div>
    )
  }

  const loan: LoanData = parseLoan(rawLoan)

  const durationDays = loan.duration / SECONDS_PER_DAY
  const isBorrower = highlightAddress?.toLowerCase() === loan.borrower.toLowerCase()
  const isLender = highlightAddress?.toLowerCase() === loan.lender.toLowerCase()
  const role = isBorrower ? 'Borrower' : isLender ? 'Lender' : null

  return (
    <div className="glass p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
            Loan #{loanId.toString()}
          </span>
          {role && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--color-accent-light)' }}
            >
              {role}
            </span>
          )}
        </div>
        <LoanStatusBadge loan={loan} isOverdue={overdue ?? false} />
      </div>

      {/* Amount */}
      <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.02em' }}>
        {formatUsdc(loan.amount)} <span className="text-lg font-semibold" style={{ color: 'var(--color-accent-light)' }}>USDC</span>
      </div>

      {/* Addresses */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--color-muted)' }}>Borrower</span>
          <a
            href={buildAddressExplorerUrl(arcTestnet.id, loan.borrower)}
            target="_blank"
            rel="noopener noreferrer"
            className="mono hover:underline"
            style={{ color: isBorrower ? 'var(--color-accent-light)' : 'var(--color-text)' }}
          >
            {shortAddr(loan.borrower)}
          </a>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--color-muted)' }}>Lender</span>
          <a
            href={buildAddressExplorerUrl(arcTestnet.id, loan.lender)}
            target="_blank"
            rel="noopener noreferrer"
            className="mono hover:underline"
            style={{ color: isLender ? 'var(--color-cyan)' : 'var(--color-text)' }}
          >
            {shortAddr(loan.lender)}
          </a>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Dates */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Duration</span>
          <span>{durationDays.toString()} day{durationDays !== 1n ? 's' : ''}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Created</span>
          <span className="tabular-nums">{formatTs(loan.createdAt)}</span>
        </div>
        {loan.state >= 1 && loan.fundedAt > 0n && (
          <>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-muted)' }}>Funded</span>
              <span className="tabular-nums">{formatTs(loan.fundedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-muted)' }}>Due date</span>
              <span
                className="tabular-nums"
                style={{ color: (overdue && loan.state === 1) ? 'var(--color-red)' : 'inherit' }}
              >
                {formatTs(loan.dueDate)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
