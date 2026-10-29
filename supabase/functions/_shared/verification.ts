/** Shared browser/backend verification rules; no frontend status is authoritative. */
import { parseUnits, type Address } from 'viem'
export interface ExpectedLoan { borrower: string; selected_lender: string | null; amount_usdc: string | number; duration_days: number }
export interface ChainLoan { borrower: Address; lender: Address; amount: bigint; duration: bigint; state: number; dueDate: bigint }
export function verifyLoanTerms(expected: ExpectedLoan, actual: ChainLoan) {
  if (!expected.selected_lender ||
      actual.borrower.toLowerCase() !== expected.borrower.toLowerCase() ||
      actual.lender.toLowerCase() !== expected.selected_lender.toLowerCase() ||
      actual.amount !== parseUnits(String(expected.amount_usdc), 6) ||
      actual.duration !== BigInt(expected.duration_days) * 86400n) {
    throw new Error('Onchain loan terms or counterparties do not match this request.')
  }
}
export function verifiedStatus(state: number): 'lender_selected' | 'funded' | 'repaid' | 'cancelled' {
  const states = ['lender_selected', 'funded', 'repaid', 'cancelled'] as const
  if (!states[state]) throw new Error('Invalid contract state')
  return states[state]
}
