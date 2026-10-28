import { LoanData } from '../loanbook-contract'

interface Props {
  loan: LoanData
  isOverdue?: boolean
}

const CONFIGS: Record<number, { label: string; cls: string; dot: string }> = {
  0: { label: 'Open',      cls: 'status-open',      dot: 'bg-blue-400' },
  1: { label: 'Funded',    cls: 'status-funded',    dot: 'bg-cyan-400' },
  2: { label: 'Repaid',    cls: 'status-repaid',    dot: 'bg-green-400' },
  3: { label: 'Cancelled', cls: 'status-cancelled', dot: 'bg-white/30' },
}

export function LoanStatusBadge({ loan, isOverdue }: Props) {
  if (loan.state === 1 && isOverdue) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold status-overdue">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Overdue
      </span>
    )
  }

  const cfg = CONFIGS[loan.state] ?? CONFIGS[0]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
