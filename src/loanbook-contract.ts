/**
 * LoanBook contract wiring — deployed on Arc Testnet.
 * Address and ABI sourced directly from the Foundry artifact.
 */

export const LOANBOOK_ADDRESS = '0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228' as const

export const LOANBOOK_ABI = [
  {
    type: 'function',
    name: 'createLoan',
    inputs: [
      { name: 'lender', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'loanId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'fundLoan',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'repayLoan',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancelLoan',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getLoan',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'borrower', type: 'address' },
          { name: 'lender', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'fundedAt', type: 'uint256' },
          { name: 'dueDate', type: 'uint256' },
          { name: 'state', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOverdue',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'loanCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'LoanCreated',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'lender', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'duration', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LoanFunded',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'lender', type: 'address', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'dueDate', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LoanRepaid',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'lender', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'repaidAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LoanCancelled',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'cancelledAt', type: 'uint256', indexed: false },
    ],
  },
  { type: 'error', name: 'LoanBook__ZeroAmount', inputs: [] },
  { type: 'error', name: 'LoanBook__ZeroDuration', inputs: [] },
  { type: 'error', name: 'LoanBook__InvalidLender', inputs: [] },
  { type: 'error', name: 'LoanBook__InvalidUSDC', inputs: [] },
  { type: 'error', name: 'LoanBook__SelfLend', inputs: [] },
  { type: 'error', name: 'LoanBook__NotBorrower', inputs: [] },
  { type: 'error', name: 'LoanBook__NotLender', inputs: [] },
  {
    type: 'error',
    name: 'LoanBook__InvalidState',
    inputs: [
      { name: 'loanId', type: 'uint256' },
      { name: 'actual', type: 'uint8' },
      { name: 'expected', type: 'uint8' },
    ],
  },
  { type: 'error', name: 'LoanBook__LoanNotFound', inputs: [{ name: 'loanId', type: 'uint256' }] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
] as const

// Loan state enum (matches contract)
export enum LoanState {
  Open = 0,
  Funded = 1,
  Repaid = 2,
  Cancelled = 3,
}

export const LOAN_STATE_LABELS: Record<LoanState, string> = {
  [LoanState.Open]: 'Open',
  [LoanState.Funded]: 'Funded',
  [LoanState.Repaid]: 'Repaid',
  [LoanState.Cancelled]: 'Cancelled',
}

export interface LoanData {
  borrower: string
  lender: string
  amount: bigint
  duration: bigint
  createdAt: bigint
  fundedAt: bigint
  dueDate: bigint
  state: number
}

/** Parse the object wagmi returns for a getLoan call into a flat LoanData */
export function parseLoan(raw: {
  borrower: string
  lender: string
  amount: bigint
  duration: bigint
  createdAt: bigint
  fundedAt: bigint
  dueDate: bigint
  state: number
}): LoanData {
  return {
    borrower: raw.borrower,
    lender: raw.lender,
    amount: raw.amount,
    duration: raw.duration,
    createdAt: raw.createdAt,
    fundedAt: raw.fundedAt,
    dueDate: raw.dueDate,
    state: raw.state,
  }
}

/**
 * Format USDC amount (6 decimals) as human-readable string.
 * Uses pure bigint arithmetic — no floating-point.
 *
 * LB-018 fix: the old implementation used Number(raw) / 1_000_000 which
 * loses precision for amounts with more than ~15 significant digits.
 * Safe range for this implementation: uint256, any value.
 */
export function formatUsdc(raw: bigint, dp = 2): string {
  if (raw < 0n) return '0.00'
  const SCALE = 1_000_000n
  const whole = raw / SCALE
  const frac  = raw % SCALE          // 0–999_999
  // pad to 6 digits, then truncate to dp
  const fracStr = frac.toString().padStart(6, '0').slice(0, dp)
  return dp > 0 ? `${whole}.${fracStr}` : `${whole}`
}

/**
 * Parse a human-readable USDC string to a 6-decimal bigint.
 * Rejects: negative, NaN, > 2 decimal digits beyond 6 (0.0000001 is 7 decimals),
 * values with more than 6 fractional decimal places (would silently truncate).
 *
 * LB-018 fix: the old implementation used parseFloat() * 1_000_000 which
 * introduces IEEE-754 rounding errors. e.g. 0.1 * 1_000_000 = 99999.99999…
 * New implementation: string-based bigint arithmetic with no floating-point.
 */
export function parseUsdc(str: string): bigint {
  if (!str || str === '') return 0n
  const trimmed = str.trim()
  // Must be a valid decimal number: optional sign, digits, optional dot+digits
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0n

  const [wholePart, fracPart = ''] = trimmed.split('.')
  // Allow at most 6 fractional decimal places (USDC has 6 decimals)
  if (fracPart.length > 6) return 0n

  const wholeInt = BigInt(wholePart || '0')
  // Pad/truncate fractional part to exactly 6 digits
  const fracPadded = fracPart.padEnd(6, '0')
  const fracInt    = BigInt(fracPadded)

  const result = wholeInt * 1_000_000n + fracInt
  if (result === 0n) return 0n
  return result
}

/**
 * Validate a USDC amount string for UI display.
 * Returns an error message or null if valid.
 */
export function validateUsdcInput(str: string, options?: {
  min?: bigint   // default: 1n (0.000001 USDC)
  max?: bigint   // default: 1_000_000_000_000n (1M USDC)
}): string | null {
  const { min = 1n, max = 1_000_000_000_000n } = options ?? {}
  if (!str || str.trim() === '') return 'Amount is required'
  if (!/^\d+(\.\d+)?$/.test(str.trim())) return 'Enter a valid number (e.g. 10.50)'
  const [, frac = ''] = str.split('.')
  if (frac.length > 6) return 'At most 6 decimal places allowed'
  const raw = parseUsdc(str)
  if (raw === 0n) return 'Amount must be greater than zero'
  if (raw < min) return `Minimum amount is ${formatUsdc(min, 6)} USDC`
  if (raw > max) return `Amount too large`
  return null
}

/** Format a Unix timestamp (seconds) to locale date-time */
export function formatTs(ts: bigint): string {
  if (ts === 0n) return '—'
  return new Date(Number(ts) * 1000).toLocaleString()
}

/** Shorten an address for display */
export function shortAddr(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}
