import { useState, useEffect } from 'react'
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
  onFunded: () => void
}

const USDC = getUsdc(arcTestnet.id)!

export function ApproveAndFundPanel({ loanId, loan, onFunded }: Props) {
  const { address } = useAccount()
  const [approveError, setApproveError] = useState('')
  const [fundError, setFundError] = useState('')

  // ── Live ERC-20 balance ────────────────────────────────────────────────────
  const { data: lenderBalance } = useReadContract({
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
  const hasEnoughBalance   = (lenderBalance ?? 0n) >= loan.amount

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

  // Derive current step from observable state — no separate step state needed
  const step: 'approve' | 'fund' = (approveSuccess || hasEnoughAllowance) ? 'fund' : 'approve'

  // ── Fund ───────────────────────────────────────────────────────────────────
  const {
    writeContract: writeFund,
    data: fundHash,
    isPending: fundPending,
    error: fundErr,
    reset: resetFund,
  } = useWriteContract()
  const { isLoading: fundConfirming, isSuccess: fundSuccess } =
    useWaitForTransactionReceipt({ hash: fundHash })

  useEffect(() => {
    if (fundSuccess) onFunded()
  }, [fundSuccess, onFunded])

  // ── Derived ────────────────────────────────────────────────────────────────
  const approveTxState: TxState =
    approvePending   ? 'signing'    :
    approveConfirming ? 'confirming' :
    approveSuccess    ? 'success'   : 'idle'

  const fundTxState: TxState =
    fundPending    ? 'signing'    :
    fundConfirming ? 'confirming' :
    fundSuccess    ? 'success'   : 'idle'

  const isLender = address?.toLowerCase() === loan.lender.toLowerCase()

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loan.state !== 0) {
    return (
      <div className="glass p-5 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
        This loan is no longer open.
      </div>
    )
  }

  if (!isLender) {
    return (
      <div className="glass p-5 text-sm text-center" style={{ color: 'var(--color-muted)' }}>
        Only the named lender can fund this loan.
      </div>
    )
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleApprove() {
    setApproveError('')
    resetApprove()
    writeApprove({
      address: USDC.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [LOANBOOK_ADDRESS, loan.amount],
      chainId: arcTestnet.id,
    })
  }

  function handleFund() {
    setFundError('')
    resetFund()
    writeFund({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'fundLoan',
      args: [loanId],
      chainId: arcTestnet.id,
    })
  }

  const approveDisplayError = approveError || (approveErr ? parseOnchainError(approveErr) : '')
  const fundDisplayError    = fundError    || (fundErr    ? parseOnchainError(fundErr)    : '')

  const balanceOk = hasEnoughBalance
  const balanceLabel = lenderBalance !== undefined
    ? `Your balance: ${formatUsdc(lenderBalance)} USDC`
    : 'Loading balance…'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
          Fund Loan #{loanId.toString()}
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          Two steps: approve USDC allowance, then fund. You are connected as lender.
        </p>
      </div>

      {/* Summary */}
      <div
        className="rounded-xl px-4 py-3 space-y-1 text-sm"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Principal</span>
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
            style={{ color: balanceOk ? 'var(--color-green)' : 'var(--color-red)' }}
          >
            {lenderBalance !== undefined ? `${formatUsdc(lenderBalance)} USDC` : '…'}{' '}
            {lenderBalance !== undefined && !balanceOk && '⚠ insufficient'}
          </span>
        </div>
      </div>

      {/* Insufficient balance warning */}
      {lenderBalance !== undefined && !balanceOk && (
        <div
          className="rounded-xl px-4 py-3 text-xs space-y-1"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-red)' }}
        >
          <p className="font-semibold">Insufficient USDC balance</p>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>
            {balanceLabel}. You need {formatUsdc(loan.amount)} USDC.
            Use "Get test USDC" in the Arc Studio sidebar to fund your wallet.
          </p>
        </div>
      )}

      {/* Step 1: Approve */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          border: `1px solid ${step === 'approve' ? 'var(--color-accent)' : 'var(--color-border)'}`,
          opacity: step === 'fund' ? 0.6 : 1,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: (approveSuccess || step === 'fund') ? 'var(--color-green)' : 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {(approveSuccess || step === 'fund') ? '✓' : '1'}
          </span>
          <span className="text-sm font-medium">Approve USDC</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Authorize LoanBook to transfer exactly{' '}
          <strong className="text-white">{formatUsdc(loan.amount)} USDC</strong> from your wallet.
          This calls <span className="mono">approve(LoanBook, {loan.amount.toString()})</span> on the
          USDC ERC-20 contract.
        </p>

        {approveDisplayError && (
          <p
            className="text-xs rounded-lg px-3 py-2 break-words"
            style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}
          >
            {approveDisplayError}
          </p>
        )}

        {!approveSuccess && !hasEnoughAllowance && (
          <TxButton
            state={approveTxState}
            onClick={handleApprove}
            disabled={!balanceOk}
            className="w-full"
          >
            Approve {formatUsdc(loan.amount)} USDC
          </TxButton>
        )}

        {(approveSuccess || hasEnoughAllowance) && (
          <div
            className="text-xs rounded-lg px-3 py-2"
            style={{ color: 'var(--color-green)', background: 'rgba(34,197,94,0.08)' }}
          >
            Allowance confirmed — {formatUsdc(allowance ?? 0n)} USDC approved.
          </div>
        )}

        {approveHash && <TxReceipt hash={approveHash} label="Approve tx" chainId={arcTestnet.id} />}
      </div>

      {/* Step 2: Fund */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          border: `1px solid ${step === 'fund' ? 'var(--color-cyan)' : 'var(--color-border)'}`,
          opacity: step === 'approve' && !hasEnoughAllowance ? 0.4 : 1,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: fundSuccess ? 'var(--color-green)' : 'var(--color-cyan)', color: '#fff' }}
          >
            {fundSuccess ? '✓' : '2'}
          </span>
          <span className="text-sm font-medium">Fund Loan</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Calls <span className="mono">fundLoan({loanId.toString()})</span> — transfers{' '}
          <strong className="text-white">{formatUsdc(loan.amount)} USDC</strong> directly to the borrower
          and starts the repayment clock.
        </p>

        {fundDisplayError && (
          <p
            className="text-xs rounded-lg px-3 py-2 break-words"
            style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}
          >
            {fundDisplayError}
          </p>
        )}

        <TxButton
          state={fundTxState}
          onClick={handleFund}
          disabled={!hasEnoughAllowance && !approveSuccess}
          variant="secondary"
          className="w-full"
        >
          Fund Loan
        </TxButton>

        {fundHash && <TxReceipt hash={fundHash} label="Fund tx" chainId={arcTestnet.id} />}
      </div>
    </div>
  )
}
