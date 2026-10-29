import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { activeChain as arcTestnet } from '../network'
import { Search } from 'lucide-react'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, parseLoan } from '../loanbook-contract'
import { LoanCard } from './LoanCard'
import { ApproveAndFundPanel } from './ApproveAndFundPanel'
import { ApproveAndRepayPanel } from './ApproveAndRepayPanel'
import { TxButton, type TxState } from './TxButton'
import { TxReceipt } from './TxReceipt'
import { parseOnchainError } from '../onchain-error'

interface Props { defaultLoanId?: bigint }

export function LookupPanel({ defaultLoanId }: Props) {
  const { address } = useAccount()
  const [inputId, setInputId] = useState(defaultLoanId?.toString() ?? '')
  const [activeLoanId, setActiveLoanId] = useState<bigint | null>(defaultLoanId ?? null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: rawLoan } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'getLoan',
    args: [activeLoanId ?? 1n],
    chainId: arcTestnet.id,
    query: { enabled: activeLoanId !== null, refetchInterval: 5000 },
  })

  const { data: overdue } = useReadContract({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'isOverdue',
    args: [activeLoanId ?? 1n],
    chainId: arcTestnet.id,
    query: { enabled: activeLoanId !== null, refetchInterval: 5000 },
  })

  const loan = rawLoan
    ? parseLoan(rawLoan)
    : null

  // Cancel loan (borrower, Open state only)
  const { writeContract: writeCancel, data: cancelHash, isPending: cancelPending, error: cancelErr, reset: resetCancel } = useWriteContract()
  const { isLoading: cancelConfirming, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash })

  const cancelState: TxState =
    cancelPending ? 'signing' : cancelConfirming ? 'confirming' : cancelSuccess ? 'success' : 'idle'

  function handleLookup() {
    if (/^[1-9]\d*$/.test(inputId.trim())) setActiveLoanId(BigInt(inputId.trim()))
  }

  function handleRefresh() {
    setRefreshKey(k => k + 1)
  }

  function handleCancel() {
    if (!activeLoanId) return
    resetCancel()
    writeCancel({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'cancelLoan',
      args: [activeLoanId],
      chainId: arcTestnet.id,
    })
  }

  const isBorrower = loan && address?.toLowerCase() === loan.borrower.toLowerCase()
  const isLender = loan && address?.toLowerCase() === loan.lender.toLowerCase()

  return (
    <div className="space-y-4" key={refreshKey}>
      {/* Search bar */}
      <div className="glass p-4">
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-muted)' }}>
          Look up a loan by ID
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
            <input
              type="number"
              min="1"
              placeholder="Loan ID (e.g. 1)"
              value={inputId}
              onChange={e => setInputId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm mono outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <button
            onClick={handleLookup}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            Load
          </button>
          {activeLoanId !== null && (
            <button
              onClick={handleRefresh}
              className="px-3 py-2.5 rounded-xl text-xs transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
              title="Refresh"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {activeLoanId !== null && (
        <>
          <LoanCard loanId={activeLoanId} highlightAddress={address} />

          {loan && loan.state === 0 && isLender && (
            <ApproveAndFundPanel
              loanId={activeLoanId}
              loan={loan}
              onFunded={handleRefresh}
            />
          )}

          {loan && loan.state === 1 && isBorrower && (
            <ApproveAndRepayPanel
              loanId={activeLoanId}
              loan={loan}
              isOverdue={overdue ?? false}
              onRepaid={handleRefresh}
            />
          )}

          {loan && loan.state === 0 && isBorrower && (
            <div className="glass p-5 space-y-3">
              <h3 className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Cancel Loan</h3>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                As the borrower, you can cancel this loan before it is funded.
              </p>
              {cancelErr && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}>
                  {parseOnchainError(cancelErr)}
                </p>
              )}
              <TxButton state={cancelState} onClick={handleCancel} variant="danger" className="w-full">
                Cancel Loan
              </TxButton>
              {cancelHash && <TxReceipt hash={cancelHash} label="Cancel tx" chainId={arcTestnet.id} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
