import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { activeChain as arcTestnet } from '../network'
import { isAddress } from 'viem'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, parseUsdc, validateUsdcInput } from '../loanbook-contract'
import { parseOnchainError } from '../onchain-error'
import { TxButton, type TxState } from './TxButton'
import { TxReceipt } from './TxReceipt'

interface Props { onCreated: (loanId: bigint) => void }

export function CreateLoanPanel({ onCreated }: Props) {
  const { address } = useAccount()
  const [lenderAddr, setLenderAddr] = useState('')
  const [amount, setAmount] = useState('0.01')
  const [days, setDays] = useState('7')
  const [error, setError] = useState('')

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash })

  // Parse loanId from LoanCreated event in receipt
  const createdLoanId = (() => {
    if (!receipt) return null
    // LoanCreated topic0 = keccak256("LoanCreated(uint256,address,address,uint256,uint256)")
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === LOANBOOK_ADDRESS.toLowerCase() &&
        log.topics[0] === '0xd62d0078daaad723b2ab43c15be6e72d2e7bf915e6314eb46555234b40f5fdf2'
      ) {
        // topics[1] = loanId (uint256, indexed)
        return log.topics[1] ? BigInt(log.topics[1]) : null
      }
    }
    return null
  })()

  useEffect(() => {
    if (isSuccess && receipt?.status === 'success' && createdLoanId !== null) onCreated(createdLoanId)
  }, [isSuccess, receipt?.status, createdLoanId, onCreated])

  const txState: TxState =
    isPending ? 'signing' :
    isConfirming ? 'confirming' :
    isSuccess ? 'success' : 'idle'

  const displayError = error || (writeError ? parseOnchainError(writeError) : '')

  function handleCreate() {
    setError('')
    if (!address) { setError('Connect your wallet first.'); return }
    if (!isAddress(lenderAddr)) { setError('Enter a valid lender address.'); return }
    if (lenderAddr.toLowerCase() === address.toLowerCase()) { setError('Borrower and lender must be different.'); return }
    // LB-018 fix: string-based bigint validation — no floating-point
    const amtErr = validateUsdcInput(amount, { min: 1n })
    if (amtErr) { setError(amtErr); return }
    const rawAmount = parseUsdc(amount)
    const daysInt = Number(days)
    if (!Number.isInteger(daysInt) || daysInt <= 0 || daysInt > 3650) {
      setError('Duration must be between 1 and 3650 days.'); return
    }
    const durationSecs = daysInt * 86400

    reset()
    writeContract({
      address: LOANBOOK_ADDRESS,
      abi: LOANBOOK_ABI,
      functionName: 'createLoan',
      args: [lenderAddr, rawAmount, BigInt(durationSecs)],
      chainId: arcTestnet.id,
    })
  }

  return (
    <div className="glass p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Create Loan Request</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          You are the borrower. Name a lender, amount, and duration.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Lender address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={lenderAddr}
            onChange={e => setLenderAddr(e.target.value.trim())}
            className="w-full rounded-xl px-4 py-3 text-sm mono outline-none transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
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
              >
                USDC
              </span>
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
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="w-32">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Duration (days)
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
              >
                d
              </span>
            </div>
          </div>
        </div>
      </div>

      {displayError && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)' }}>
          {displayError}
        </p>
      )}

      <TxButton state={txState} onClick={handleCreate} className="w-full">
        Create Loan Request
      </TxButton>

      {hash && <TxReceipt hash={hash} label="Create tx" chainId={arcTestnet.id} />}

      {isSuccess && createdLoanId !== null && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--color-green)' }}
        >
          Loan #{createdLoanId.toString()} created. Scroll down to fund it.
        </div>
      )}
    </div>
  )
}

