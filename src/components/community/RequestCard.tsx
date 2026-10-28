/**
 * RequestCard — displays a single loan request with interest expressions.
 * When the connected wallet is the borrower, shows the "select lender" flow.
 * When the connected wallet is a group member (not the borrower), shows "I'm Interested".
 * When borrower selects a lender and confirms, calls the existing createLoan contract.
 */
import { useState, useEffect, useCallback } from 'react'
import { HandHeart, CheckCircle2, ChevronRight, Loader2, Clock, XCircle } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoanRequest, LoanInterest } from '../../lib/supabase'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, parseUsdc } from '../../loanbook-contract'
import { parseOnchainError } from '../../onchain-error'
import { TxReceipt } from '../TxReceipt'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }
function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface Props {
  request: LoanRequest
  wallet: string
  client: SupabaseClient
  onLoanCreated: (loanId: bigint) => void
}

export function RequestCard({ request, wallet, client, onLoanCreated }: Props) {
  const { address } = useAccount()
  const [interests, setInterests] = useState<LoanInterest[]>([])
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick(t => t + 1), [])

  const isBorrower = wallet === request.borrower
  const myInterest = interests.find(i => i.lender === wallet)
  const [selectedLender, setSelectedLender] = useState<string | null>(request.selected_lender)
  const [confirmStage, setConfirmStage] = useState(false)

  // Onchain createLoan
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess && receipt) {
      // Parse LoanCreated event from receipt to get the loanId
      const LOAN_CREATED_TOPIC = '0xd62d0078daaad723b2ab43c15be6e72d2e7bf915e6314eb46555234b40f5fdf2'
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === LOANBOOK_ADDRESS.toLowerCase() &&
          log.topics[0] === LOAN_CREATED_TOPIC &&
          log.topics[1]
        ) {
          const loanId = BigInt(log.topics[1])
          // Update request status in DB
          void client
            .from('loan_requests')
            .update({ status: 'lender_selected', selected_lender: selectedLender, onchain_loan_id: Number(loanId) })
            .eq('id', request.id)
          onLoanCreated(loanId)
          return
        }
      }
    }
  }, [isSuccess, receipt, client, request.id, selectedLender, onLoanCreated])

  // Load interests
  useEffect(() => {
    let cancelled = false
    client
      .from('loan_interests')
      .select('*')
      .eq('request_id', request.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setInterests((data as LoanInterest[]) ?? [])
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, request.id, tick])

  // Subscribe to realtime interest changes
  useEffect(() => {
    const channel = client
      .channel(`interests:${request.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loan_interests',
        filter: `request_id=eq.${request.id}`,
      }, () => bump())
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [client, request.id, bump])

  async function handleInterest() {
    if (!wallet) return
    if (myInterest) {
      await client.from('loan_interests').delete().eq('id', myInterest.id)
    } else {
      await client.from('loan_interests').insert({ request_id: request.id, lender: wallet })
    }
    bump()
  }

  function handleSelectLender(lender: string) {
    setSelectedLender(lender)
    setConfirmStage(true)
  }

  function handleConfirmOnchain() {
    if (!selectedLender || !address) return
    reset()
    // LB-018 fix: use string-based bigint parser, not float arithmetic
    const amountRaw = parseUsdc(request.amount_usdc)
    const durationSecs = BigInt(request.duration_days * 86400)
    writeContract({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'createLoan',
      args: [selectedLender as `0x${string}`, amountRaw, durationSecs],
      chainId: arcTestnet.id,
    })
  }

  const txState = isPending ? 'signing' : isConfirming ? 'confirming' : isSuccess ? 'success' : 'idle'

  // Status badge
  const statusColors: Record<string, string> = {
    open: 'status-open',
    lender_selected: 'status-funded',
    funded: 'status-funded',
    repaid: 'status-repaid',
    cancelled: 'status-cancelled',
  }

  return (
    <div className="glass p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-accent-light)' }}
          >
            {request.borrower.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-semibold text-white">{shortAddr(request.borrower)}</p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{relativeTime(request.created_at)}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[request.status] ?? 'status-open'}`}>
          {request.status.replace('_', ' ')}
        </span>
      </div>

      {/* Loan terms */}
      <div
        className="rounded-xl px-4 py-3 space-y-1 text-sm"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-muted)' }}>Loan request</span>
          <span className="font-bold tabular-nums" style={{ color: 'var(--color-accent-light)' }}>
            {request.amount_usdc} USDC
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--color-muted)' }}>Duration</span>
          <span className="flex items-center gap-1">
            <Clock size={10} style={{ color: 'var(--color-muted)' }} />
            {request.duration_days} day{request.duration_days !== 1 ? 's' : ''}
          </span>
        </div>
        {request.note && (
          <p className="text-xs pt-1" style={{ color: 'rgba(255,255,255,0.7)', borderTop: '1px solid var(--color-border)' }}>
            "{request.note}"
          </p>
        )}
      </div>

      {/* Interests section */}
      {request.status === 'open' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              Interested lenders ({interests.length})
            </p>
            {!isBorrower && (
              <button
                onClick={() => { void handleInterest() }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: myInterest ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                  color: myInterest ? 'var(--color-green)' : 'var(--color-accent-light)',
                }}
              >
                {myInterest
                  ? <><CheckCircle2 size={11} />Interested</>
                  : <><HandHeart size={11} />I'm Interested</>
                }
              </button>
            )}
          </div>

          {interests.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              No one has expressed interest yet.
            </p>
          ) : (
            <div className="space-y-1">
              {interests.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
                >
                  <span className="text-xs mono" style={{ color: 'var(--color-text)' }}>
                    {shortAddr(entry.lender)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {relativeTime(entry.created_at)}
                    </span>
                    {isBorrower && !confirmStage && (
                      <button
                        onClick={() => handleSelectLender(entry.lender)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(59,130,246,0.18)', color: 'var(--color-accent-light)' }}
                      >
                        Select <ChevronRight size={10} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm onchain stage */}
      {isBorrower && confirmStage && selectedLender && request.status === 'open' && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          <p className="text-sm font-semibold">Confirm lender onchain</p>
          <div className="text-xs space-y-1" style={{ color: 'var(--color-muted)' }}>
            <div className="flex justify-between">
              <span>Lender</span>
              <span className="mono text-white">{shortAddr(selectedLender)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount</span>
              <span className="font-semibold text-white">{request.amount_usdc} USDC</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="text-white">{request.duration_days} days</span>
            </div>
          </div>
          <div
            className="text-xs rounded-lg px-3 py-2 flex items-start gap-2"
            style={{ background: 'rgba(245,158,11,0.08)', color: 'rgba(245,158,11,0.9)' }}
          >
            <span>⚠</span>
            <span>This transaction costs a small USDC gas fee on Arc Testnet. It creates the onchain agreement — the lender then approves and funds separately.</span>
          </div>

          {writeError && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}>
              {parseOnchainError(writeError)}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setConfirmStage(false); setSelectedLender(null) }}
              className="flex-1 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
            >
              Back
            </button>
            <button
              onClick={handleConfirmOnchain}
              disabled={isPending || isConfirming || isSuccess}
              className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 flex items-center justify-center gap-1"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              {txState === 'signing' && <><Loader2 size={11} className="animate-spin" />Check wallet…</>}
              {txState === 'confirming' && <><Loader2 size={11} className="animate-spin" />Confirming…</>}
              {txState === 'success' && <><CheckCircle2 size={11} />Created!</>}
              {txState === 'idle' && <>Create Onchain Agreement</>}
            </button>
          </div>

          {txHash && <TxReceipt hash={txHash} label="Create tx" chainId={arcTestnet.id} />}
        </div>
      )}

      {/* Already has onchain loan ID */}
      {request.onchain_loan_id !== null && (
        <div
          className="text-xs rounded-lg px-3 py-2 flex items-center gap-2"
          style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--color-green)' }}
        >
          <CheckCircle2 size={11} />
          Onchain loan #{request.onchain_loan_id} created. Use Fund/Repay tab to continue.
        </div>
      )}

      {/* Cancelled */}
      {request.status === 'cancelled' && isBorrower && (
        <div className="text-xs flex items-center gap-1" style={{ color: 'var(--color-muted)' }}>
          <XCircle size={11} />Cancelled by borrower.
        </div>
      )}
    </div>
  )
}
