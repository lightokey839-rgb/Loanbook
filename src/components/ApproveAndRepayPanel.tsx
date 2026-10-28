import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, LoanData, formatUsdc } from '../loanbook-contract'
import { getUsdc } from '../onchain-facts'
import { parseOnchainError } from '../onchain-error'
import { TxButton, type TxState } from './TxButton'
import { TxReceipt } from './TxReceipt'

interface Props {
  loanId: bigint
  loan: LoanData
  isOverdue: boolean
  onRepaid: () => void
}

const USDC = getUsdc(arcTestnet.id)!

export function ApproveAndRepayPanel({ loanId, loan, isOverdue, onRepaid }: Props) {
  const { address } = useAccount()

  // ── Live ERC-20 balance ────────────────────────────────────────────────────
  const { data: borrowerBalance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 6000 },
  })

  // ── Current allowance ──────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', LOANBOOK_ADDRESS],
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 6000 },
  })

  const hasEnoughAllowance = (allowance ?? 0n) >= loan.amount
  const hasEnoughBalance   = (borrowerBalance ?? 0n) >= loan.amount

  // ── Approve ────────────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    error: approveErr,
    reset: resetApprove,
  } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // Refetch allowance after approve confirms
  useEffect(() => {
    if (approveSuccess) refetchAllowance().catch(() => {})
  }, [approveSuccess, refetchAllowance])

  // Derive step from observable state
  const step: 'approve' | 'repay' = (approveSuccess || hasEnoughAllowance) ? 'repay' : 'approve'

  // ── Repay ──────────────────────────────────────────────────────────────────
  const {
    writeContract: writeRepay,
    data: repayHash,
    isPending: repayPending,
    error: repayErr,
    reset: resetRepay,
  } = useWriteContract()
  const { isLoading: repayConfirming, isSuccess: repaySuccess } =
    useWaitForTransactionReceipt({ hash: repayHash })

  useEffect(() => {
    if (repaySuccess) onRepaid()
  }, [repaySuccess, onRepaid])

  // ── Derived ────────────────────────────────────────────────────────────────
  const approveTxState: TxState =
    approvePending    ? 'signing'    :
    approveConfirming ? 'confirming' :
    approveSuccess    ? 'success'    : 'idle'

  const repayTxState: TxState =
    repayPending    ? 'signing'    :
    repayConfirming ? 'confirming' :
    repaySuccess    ? 'success'    : 'idle'

  const isBorrower = address?.toLowerCase() === loan.borrower.toLowerCase()

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loan.state !== 1) {
    return (
      <div className="glass p-5 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
        This loan is not in Funded state.
      </div>
    )
  }

  if (!isBorrower) {
    return (
      <div className="glass p-5 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
        Only the borrower can repay this loan.
      </div>
    )
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleApprove() {
    resetApprove()
    writeApprove({
      address: USDC.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [LOANBOOK_ADDRESS, loan.amount],
      chainId: arcTestnet.id,
    })
  }

  function handleRepay() {
    resetRepay()
    writeRepay({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'repayLoan',
      args: [loanId],
      chainId: arcTestnet.id,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
          Repay Loan #{loanId.toString()}
          {isOverdue && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full status-overdue">OVERDUE</span>
          )}
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          Approve USDC, then repay. Sends{' '}
          <strong className="text-white">{formatUsdc(loan.amount)} USDC</strong> directly to the lender.
        </p>
      </div>

      {/* Summary */}
      <div
        className="rounded-xl px-4 py-3 space-y-1 text-sm"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Repayment amount</span>
          <span className="font-semibold tabular-nums">{formatUsdc(loan.amount)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Current allowance</span>
          <span
            className="tabular-nums text-xs"
            style={{ color: hasEnoughAllowance ? 'var(--color-green)' : 'var(--color-yellow)' }}
          >
            {formatUsdc(allowance ?? 0n)} USDC {hasEnoughAllowance ? '✓' : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Your ERC-20 USDC balance</span>
          <span
            className="tabular-nums text-xs"
            style={{ color: hasEnoughBalance ? 'var(--color-green)' : 'var(--color-red)' }}
          >
            {borrowerBalance !== undefined ? `${formatUsdc(borrowerBalance)} USDC` : '…'}{' '}
            {borrowerBalance !== undefined && !hasEnoughBalance && '⚠ insufficient'}
          </span>
        </div>
      </div>

      {/* Insufficient balance warning */}
      {borrowerBalance !== undefined && !hasEnoughBalance && (
        <div
          className="rounded-xl px-4 py-3 text-xs space-y-1"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-red)' }}
        >
          <p className="font-semibold">Insufficient USDC balance for repayment</p>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>
            You have {borrowerBalance !== undefined ? formatUsdc(borrowerBalance) : '?'} USDC but need{' '}
            {formatUsdc(loan.amount)} USDC. Use "Get test USDC" in the Arc Studio sidebar.
          </p>
        </div>
      )}

      {/* Step 1: Approve */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          border: `1px solid ${step === 'approve' ? 'var(--color-accent)' : 'var(--color-border)'}`,
          opacity: step === 'repay' ? 0.6 : 1,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: (approveSuccess || step === 'repay' || hasEnoughAllowance)
                ? 'var(--color-green)'
                : 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {(approveSuccess || step === 'repay' || hasEnoughAllowance) ? '✓' : '1'}
          </span>
          <span className="text-sm font-medium">Approve USDC repayment</span>
        </div>

        {approveErr && (
          <p
            className="text-xs rounded-lg px-3 py-2 break-words"
            style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}
          >
            {parseOnchainError(approveErr)}
          </p>
        )}

        {!approveSuccess && !hasEnoughAllowance ? (
          <TxButton
            state={approveTxState}
            onClick={handleApprove}
            disabled={!hasEnoughBalance}
            className="w-full"
          >
            Approve {formatUsdc(loan.amount)} USDC
          </TxButton>
        ) : (
          <div
            className="text-xs rounded-lg px-3 py-2"
            style={{ color: 'var(--color-green)', background: 'rgba(34,197,94,0.08)' }}
          >
            Allowance confirmed — {formatUsdc(allowance ?? 0n)} USDC approved.
          </div>
        )}

        {approveHash && <TxReceipt hash={approveHash} label="Approve tx" chainId={arcTestnet.id} />}
      </div>

      {/* Step 2: Repay */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          border: `1px solid ${step === 'repay' ? 'var(--color-green)' : 'var(--color-border)'}`,
          opacity: step === 'approve' && !hasEnoughAllowance ? 0.4 : 1,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: repaySuccess ? 'var(--color-green)' : 'rgba(34,197,94,0.3)',
              color: '#fff',
            }}
          >
            {repaySuccess ? '✓' : '2'}
          </span>
          <span className="text-sm font-medium">Repay Loan</span>
        </div>

        {repayErr && (
          <p
            className="text-xs rounded-lg px-3 py-2 break-words"
            style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}
          >
            {parseOnchainError(repayErr)}
          </p>
        )}

        <TxButton
          state={repayTxState}
          onClick={handleRepay}
          disabled={!hasEnoughAllowance && !approveSuccess}
          className="w-full"
        >
          Repay {formatUsdc(loan.amount)} USDC
        </TxButton>

        {repayHash && <TxReceipt hash={repayHash} label="Repay tx" chainId={arcTestnet.id} />}
      </div>
    </div>
  )
}
