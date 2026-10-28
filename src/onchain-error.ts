/**
 * Parse onchain / wallet errors into user-friendly messages.
 * Surfaces the real underlying cause rather than swallowing it.
 */
export function parseOnchainError(error: unknown): string {
  if (!error) return ''

  // Preserve the raw message for logging / display.
  const raw = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error))
  const msg = raw.toLowerCase()

  // ── Wallet / user action ────────────────────────────────────────────────────
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('4001')) {
    return 'Transaction cancelled by wallet.'
  }

  // ── LoanBook custom errors ──────────────────────────────────────────────────
  if (msg.includes('loanbook__notlender'))      return 'Only the named lender can fund this loan.'
  if (msg.includes('loanbook__notborrower'))    return 'Only the borrower can perform this action.'
  if (msg.includes('loanbook__invalidstate'))   return "This action isn't valid for the loan's current state."
  if (msg.includes('loanbook__selflend'))       return 'Borrower and lender must be different addresses.'
  if (msg.includes('loanbook__invalidlender'))  return 'Invalid lender address.'
  if (msg.includes('loanbook__invalidusdc'))    return 'Invalid USDC address in contract.'
  if (msg.includes('loanbook__zeroamount'))     return 'Loan amount must be greater than zero.'
  if (msg.includes('loanbook__zeroduration'))   return 'Duration must be greater than zero.'
  if (msg.includes('loanbook__loannotfound'))   return 'Loan not found.'
  if (msg.includes('reentrancyguardreentrant')) return 'Reentrancy detected — transaction blocked.'

  // ── ERC-20 / transfer errors ────────────────────────────────────────────────
  if (msg.includes('safeerc20failedoperation')) {
    return 'USDC transfer failed — ensure your allowance approval is confirmed before funding.'
  }
  if (msg.includes('transfer amount exceeds allowance') || msg.includes('erc20: insufficient allowance')) {
    return 'Insufficient USDC allowance — approve the exact amount first.'
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance') ||
      msg.includes('erc20: transfer amount exceeds balance')) {
    return 'Insufficient USDC balance.'
  }

  // ── Gas / RPC errors ────────────────────────────────────────────────────────
  if (msg.includes('gas required exceeds allowance') || msg.includes('out of gas')) {
    return 'Transaction ran out of gas. Try increasing the gas limit in your wallet.'
  }
  if (msg.includes('nonce too low') || msg.includes('nonce too high')) {
    return 'Nonce mismatch — reset your wallet\'s activity data and try again.'
  }
  if (msg.includes('network') && (msg.includes('timeout') || msg.includes('rpc') || msg.includes('fetch'))) {
    return 'Network error — check your connection and try again.'
  }
  if (msg.includes('execution reverted')) {
    // Extract the reason string if present (viem format: 'execution reverted: <reason>')
    const colonIdx = raw.toLowerCase().indexOf('execution reverted:')
    if (colonIdx !== -1) {
      const reason = raw.slice(colonIdx + 'execution reverted:'.length).trim()
      if (reason && reason.length < 200) return `Reverted: ${reason}`
    }
    // Viem wraps the error details in the cause chain — extract if possible
    const causeMsg = extractCause(error)
    if (causeMsg) return `Reverted: ${causeMsg}`
    return `Transaction reverted. Raw: ${raw.slice(0, 120)}`
  }
  if (msg.includes('reverted')) {
    const causeMsg = extractCause(error)
    if (causeMsg) return `Transaction failed: ${causeMsg}`
    // Surface the raw message truncated, not the generic fallback.
    return `Transaction failed: ${raw.slice(0, 200)}`
  }

  // ── Fallback: surface the raw message so it's diagnosable ──────────────────
  return `Error: ${raw.slice(0, 200)}`
}

/** Walk the error cause chain to find the most specific message. */
function extractCause(error: unknown, depth = 0): string | null {
  if (depth > 5 || !error || typeof error !== 'object') return null
  const e = error as Record<string, unknown>
  if (typeof e['shortMessage'] === 'string' && e['shortMessage']) return e['shortMessage']
  if (typeof e['details'] === 'string' && e['details'])           return e['details']
  if (e['cause'])                                                   return extractCause(e['cause'], depth + 1)
  return null
}
