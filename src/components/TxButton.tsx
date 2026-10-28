import { type ReactNode } from 'react'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

interface Props {
  state: TxState
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
}

const IDLE_LABELS: Record<string, string> = {}

export function TxButton({ state, onClick, disabled, children, variant = 'primary', className = '' }: Props) {
  void IDLE_LABELS

  const isDisabled = disabled || state === 'signing' || state === 'confirming'

  const bg = {
    primary: 'var(--color-accent)',
    secondary: 'rgba(255,255,255,0.08)',
    danger: 'rgba(239,68,68,0.15)',
  }[variant]

  const textColor = {
    primary: '#fff',
    secondary: 'rgba(255,255,255,0.85)',
    danger: 'var(--color-red)',
  }[variant]

  const label =
    state === 'signing' ? 'Confirm in wallet…' :
    state === 'confirming' ? 'Confirming…' :
    state === 'success' ? 'Done!' :
    <>{children}</>

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm transition-all ${className}`}
      style={{
        background: bg,
        color: textColor,
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        border: variant === 'secondary' ? '1px solid var(--color-border)' : 'none',
      }}
    >
      {(state === 'signing' || state === 'confirming') && (
        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {label}
    </button>
  )
}
