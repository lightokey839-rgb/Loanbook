/**
 * LoanRequestPanel — four-stage social lending flow
 *
 * Stage 1: Borrower posts an offchain loan request (no gas, no lender address).
 * Stage 2: Prospective lenders click "I'm Interested" (stored locally).
 * Stage 3: Borrower reviews interested wallets and selects a lender.
 * Stage 4: Borrower confirms terms + fee notice, calls createLoan onchain.
 *
 * ⚠ Stages 1–3 currently use localStorage only (see interest-store.ts / LB-006).
 * Full private-group visibility requires the Phase 4 Supabase backend.
 */
import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { Users, HandHeart, CheckCircle2, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  createRequest,
  getRequest,
  expressInterest,
  getInterestForRequest,
  hasExpressedInterest,
  withdrawInterest,
  type LoanRequest,
  type InterestEntry,
} from '../interest-store'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, parseUsdc, formatUsdc, shortAddr } from '../loanbook-contract'
import { parseOnchainError } from '../onchain-error'
import { TxButton, type TxState } from './TxButton'
import { TxReceipt } from './TxReceipt'

type Stage = 'draft' | 'interest' | 'select' | 'confirm'

interface Props {
  onCreated: (loanId: bigint) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StageIndicator({ current }: { current: Stage }) {
  const stages: { id: Stage; label: string }[] = [
    { id: 'draft',    label: 'Post request' },
    { id: 'interest', label: 'Gather interest' },
    { id: 'select',   label: 'Choose lender' },
    { id: 'confirm',  label: 'Confirm onchain' },
  ]
  const idx = stages.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-0">
      {stages.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: i <= idx ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                color: i <= idx ? '#fff' : 'var(--color-muted)',
              }}
            >
              {i < idx ? '✓' : i + 1}
            </div>
            <span
              className="text-xs mt-1 whitespace-nowrap hidden sm:block"
              style={{ color: i === idx ? 'var(--color-accent-light)' : 'var(--color-muted)', fontSize: '10px' }}
            >
              {s.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div
              className="w-8 h-px mx-1 mb-4"
              style={{ background: i < idx ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Stage 1: Draft ────────────────────────────────────────────────────────────

function DraftStage({
  onPosted,
}: {
  onPosted: (req: LoanRequest) => void
}) {
  const { address } = useAccount()
  const [amount, setAmount] = useState('5.00')
  const [days, setDays] = useState('7')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function handlePost() {
    setError('')
    if (!address) { setError('Connect your wallet first.'); return }
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('Enter a valid USDC amount.'); return }
    const d = parseInt(days, 10)
    if (isNaN(d) || d < 1) { setError('Duration must be at least 1 day.'); return }
    const req = createRequest(address, amount, d, note.trim())
    onPosted(req)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
          Post a loan request
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          No gas fee yet — this is an offchain request. Group members will see it and
          can offer to lend. You only pay gas when you confirm the final agreement.
        </p>
      </div>

      <div className="space-y-3">
        {/* Amount */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Amount (USDC)
          </label>
          <div className="relative">
            <input
              type="number"
              min="0.000001"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm tabular-nums outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
              style={{ color: 'var(--color-accent-light)' }}
            >USDC</span>
          </div>
          <div className="flex gap-1 mt-1.5">
            {['0.01','0.10','1.00','5.00'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors"
                style={{
                  background: amount === v ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  color: amount === v ? 'var(--color-accent-light)' : 'var(--color-muted)',
                }}
              >{v}</button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Repayment in (days)
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={e => setDays(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm tabular-nums outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--color-muted)' }}
            >days</span>
          </div>
          <div className="flex gap-1 mt-1.5">
            {['3','7','14','30'].map(v => (
              <button
                key={v}
                onClick={() => setDays(v)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors"
                style={{
                  background: days === v ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  color: days === v ? 'var(--color-accent-light)' : 'var(--color-muted)',
                }}
              >{v}d</button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Note (optional — keep off-chain, never put secrets here)
          </label>
          <textarea
            placeholder="e.g. covering rent until paycheck, repaying Friday"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            maxLength={280}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {note.length}/280 · Stored locally only until Phase 4 backend is live.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs rounded-lg px-3 py-2"
          style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </p>
      )}

      <button
        onClick={handlePost}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
        style={{ background: 'var(--color-accent)', color: '#fff' }}
      >
        Post Request (no gas)
      </button>
    </div>
  )
}

// ── Stage 2: Interest ─────────────────────────────────────────────────────────

function InterestStage({
  req,
  onNext,
  onBack,
}: {
  req: LoanRequest
  onNext: () => void
  onBack: () => void
}) {
  const { address } = useAccount()
  // A simple counter triggers re-renders after localStorage mutations.
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])

  // Derive directly from the store on every render — no effect needed.
  const entries: InterestEntry[] = getInterestForRequest(req.id)
  const alreadyInterested = address ? hasExpressedInterest(req.id, address) : false
  const isBorrower = address?.toLowerCase() === req.borrower.toLowerCase()

  // Suppress unused-variable warning: tick is read to force re-renders.
  void tick

  function handleInterest() {
    if (!address) return
    expressInterest(req.id, address)
    bump()
  }

  function handleWithdraw() {
    if (!address) return
    withdrawInterest(req.id, address)
    bump()
  }

  return (
    <div className="space-y-4">
      {/* Request summary */}
      <div
        className="rounded-xl p-4 space-y-1"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{req.amountUsdc} USDC</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-accent-light)' }}>
            {req.durationDays}d term
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          from {shortAddr(req.borrower)}
          {req.note && ` · "${req.note}"`}
        </p>
      </div>

      {/* localStorage warning */}
      <div
        className="flex gap-2 rounded-xl p-3 text-xs"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.9)' }}
      >
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          <strong>Local-only (Phase 3).</strong> Interest is stored in this browser only.
          To demo with two accounts, open Sarah's wallet in a second browser profile,
          navigate to this request ID, and click "I'm Interested" there.
          A shared backend (Phase 4) will make this visible across devices.
        </span>
      </div>

      {/* Interest list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
            <Users size={12} className="inline mr-1" />
            Interested lenders ({entries.length})
          </p>
          <button onClick={bump} className="text-xs" style={{ color: 'var(--color-muted)' }}>
            <RefreshCw size={11} className="inline mr-1" />refresh
          </button>
        </div>

        {entries.length === 0 ? (
          <div
            className="rounded-xl p-4 text-center text-xs"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            No one has expressed interest yet.
            {!isBorrower && !alreadyInterested && ' Be the first!'}
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div
                key={e.lender}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
              >
                <CheckCircle2 size={13} style={{ color: 'var(--color-green)' }} />
                <span className="mono flex-1" style={{ color: 'var(--color-text)' }}>{shortAddr(e.lender)}</span>
                <span style={{ color: 'var(--color-muted)' }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lender action */}
      {!isBorrower && address && (
        <div>
          {alreadyInterested ? (
            <button
              onClick={handleWithdraw}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-red)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              Withdraw Interest
            </button>
          ) : (
            <button
              onClick={handleInterest}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--color-green)', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <HandHeart size={15} />
              I'm Interested
            </button>
          )}
        </div>
      )}

      {/* Borrower navigation */}
      {isBorrower && (
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)' }}
          >
            Edit request
          </button>
          <button
            onClick={onNext}
            disabled={entries.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            Select lender
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {!isBorrower && !address && (
        <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
          Connect your wallet to express interest.
        </p>
      )}
    </div>
  )
}

// ── Stage 3: Select ───────────────────────────────────────────────────────────

function SelectStage({
  req,
  onSelected,
  onBack,
}: {
  req: LoanRequest
  onSelected: (lender: string) => void
  onBack: () => void
}) {
  const entries = getInterestForRequest(req.id)
  const [chosen, setChosen] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
          Choose your lender
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          Select the wallet you want to lend to you. They will fund the loan onchain.
          This choice cannot be changed after you confirm.
        </p>
      </div>

      <div className="space-y-2">
        {entries.map(e => (
          <button
            key={e.lender}
            onClick={() => setChosen(e.lender)}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-left transition-all"
            style={{
              background: chosen === e.lender ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
              border: chosen === e.lender ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--color-border)',
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: chosen === e.lender ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)', color: '#fff' }}
            >
              {e.lender.slice(2, 4).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="mono text-xs truncate" style={{ color: 'var(--color-text)' }}>
                {e.lender}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Expressed interest {new Date(e.timestamp).toLocaleString()}
              </p>
            </div>
            {chosen === e.lender && (
              <CheckCircle2 size={16} style={{ color: 'var(--color-accent-light)', flexShrink: 0 }} />
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)' }}
        >
          Back
        </button>
        <button
          onClick={() => chosen && onSelected(chosen)}
          disabled={!chosen}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          Confirm lender
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Stage 4: Confirm onchain ──────────────────────────────────────────────────

function ConfirmStage({
  req,
  lender,
  onCreated,
  onBack,
}: {
  req: LoanRequest
  lender: string
  onCreated: (loanId: bigint) => void
  onBack: () => void
}) {
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash })

  const createdLoanId: bigint | null = (() => {
    if (!receipt) return null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === LOANBOOK_ADDRESS.toLowerCase() &&
        log.topics[0] === '0xd62d0078daaad723b2ab43c15be6e72d2e7bf915e6314eb46555234b40f5fdf2'
      ) {
        return log.topics[1] ? BigInt(log.topics[1]) : null
      }
    }
    return null
  })()

  if (isSuccess && createdLoanId !== null) {
    onCreated(createdLoanId)
  }

  const txState: TxState =
    isPending ? 'signing' :
    isConfirming ? 'confirming' :
    isSuccess ? 'success' : 'idle'

  const displayError = writeError ? parseOnchainError(writeError) : ''

  const rawAmount = parseUsdc(req.amountUsdc)
  const durationSecs = BigInt(req.durationDays * 86400)

  function handleConfirm() {
    reset()
    writeContract({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'createLoan',
      args: [lender as `0x${string}`, rawAmount, durationSecs],
      chainId: arcTestnet.id,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
          Confirm loan agreement
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          Review the terms below, then confirm. This creates an onchain record and costs
          a small USDC gas fee. Terms are immutable after confirmation.
        </p>
      </div>

      {/* Terms summary */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--color-muted)' }}>Principal</span>
          <span className="font-semibold tabular-nums">{formatUsdc(rawAmount)} USDC</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--color-muted)' }}>Duration</span>
          <span className="font-semibold">{req.durationDays} days</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--color-muted)' }}>Interest</span>
          <span className="font-semibold text-green-400">Zero</span>
        </div>
        <div
          className="pt-3 space-y-2 text-xs"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          <div className="flex justify-between">
            <span>Lender</span>
            <span className="mono" style={{ color: 'var(--color-accent-light)' }}>{shortAddr(lender)}</span>
          </div>
        </div>
      </div>

      {/* Gas fee notice */}
      <div
        className="flex gap-2 rounded-xl p-3 text-xs"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.9)' }}
      >
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          This transaction will cost a small USDC gas fee on Arc Testnet.
          Gas is paid from your wallet's USDC balance — no separate ETH needed.
        </span>
      </div>

      {/* Risk notice */}
      <div
        className="rounded-xl p-3 text-xs"
        style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        LoanBook records this agreement onchain and cannot guarantee repayment.
        Only lend or borrow within trusted communities.
      </div>

      {displayError && (
        <p className="text-xs rounded-lg px-3 py-2"
          style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}>
          {displayError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={isPending || isConfirming}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)' }}
        >
          Back
        </button>
        <div className="flex-1">
          <TxButton state={txState} onClick={handleConfirm} className="w-full">
            Confirm & Create Onchain
          </TxButton>
        </div>
      </div>

      {hash && <TxReceipt hash={hash} label="Create tx" chainId={arcTestnet.id} />}

      {isSuccess && createdLoanId !== null && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--color-green)' }}
        >
          ✓ Loan #{createdLoanId.toString()} created onchain. Opening fund / repay view…
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LoanRequestPanel({ onCreated }: Props) {
  const [stage, setStage] = useState<Stage>('draft')
  const [request, setRequest] = useState<LoanRequest | null>(null)
  const [selectedLender, setSelectedLender] = useState<string | null>(null)

  // Allow re-joining an existing request from a previous session
  const [resumeId, setResumeId] = useState('')
  const [resumeError, setResumeError] = useState('')

  function handlePosted(req: LoanRequest) {
    setRequest(req)
    setStage('interest')
  }

  function handleBack() {
    setStage(prev =>
      prev === 'interest' ? 'draft' :
      prev === 'select'   ? 'interest' :
      prev === 'confirm'  ? 'select' : 'draft'
    )
  }

  function handleResume() {
    setResumeError('')
    const req = getRequest(resumeId.trim())
    if (!req) { setResumeError('Request not found in this browser.'); return }
    setRequest(req)
    setStage('interest')
    setResumeId('')
  }

  return (
    <div className="glass p-6 space-y-5">
      {/* Header + stepper */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
              Request a Loan
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Post a request · gather interest · pick a lender · confirm onchain
            </p>
          </div>
        </div>
        <StageIndicator current={stage} />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Stage content */}
      {stage === 'draft' && (
        <>
          <DraftStage onPosted={handlePosted} />

          {/* Resume existing request (for cross-device demo) */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              Resume an existing request (paste request ID)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-…"
                value={resumeId}
                onChange={e => setResumeId(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-xs mono outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <button
                onClick={handleResume}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-accent-light)' }}
              >
                Load
              </button>
            </div>
            {resumeError && (
              <p className="text-xs" style={{ color: 'var(--color-red)' }}>{resumeError}</p>
            )}
          </div>
        </>
      )}

      {stage === 'interest' && request && (
        <>
          {/* Request ID for sharing */}
          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ color: 'var(--color-muted)' }}>
              Request ID (share with potential lenders so they can load it):
            </p>
            <p className="mono mt-1 break-all" style={{ color: 'var(--color-accent-light)' }}>
              {request.id}
            </p>
          </div>
          <InterestStage req={request} onNext={() => setStage('select')} onBack={handleBack} />
        </>
      )}

      {stage === 'select' && request && (
        <SelectStage
          req={request}
          onSelected={lender => { setSelectedLender(lender); setStage('confirm') }}
          onBack={handleBack}
        />
      )}

      {stage === 'confirm' && request && selectedLender && (
        <ConfirmStage
          req={request}
          lender={selectedLender}
          onCreated={onCreated}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
