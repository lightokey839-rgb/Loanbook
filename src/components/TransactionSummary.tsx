import { activeChain } from '../network'
import { LOANBOOK_ADDRESS, shortAddr } from '../loanbook-contract'

interface Props {
  action: string
  amount?: string
  counterparty?: string
}

export function TransactionSummary({ action, amount, counterparty }: Props) {
  return (
    <div className="rounded-xl px-4 py-3 space-y-1 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
      <p className="font-semibold text-sm">Review before signing</p>
      <p><span style={{ color: 'var(--color-muted)' }}>Action:</span> {action}</p>
      {amount && <p><span style={{ color: 'var(--color-muted)' }}>Amount:</span> {amount} USDC</p>}
      {counterparty && <p><span style={{ color: 'var(--color-muted)' }}>Counterparty:</span> <span className="mono">{shortAddr(counterparty)}</span></p>}
      <p><span style={{ color: 'var(--color-muted)' }}>Network:</span> {activeChain.name} ({activeChain.id})</p>
      <p><span style={{ color: 'var(--color-muted)' }}>Contract:</span> <span className="mono break-all">{LOANBOOK_ADDRESS}</span></p>
    </div>
  )
}
