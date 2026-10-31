import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoanRequest, LoanInterest } from '../../lib/supabase'
import { LOANBOOK_ADDRESS, LOANBOOK_ABI, parseUsdc } from '../../loanbook-contract'
import { activeChain, deploymentReady } from '../../network'
import { parseOnchainError } from '../../onchain-error'
import { TxReceipt } from '../TxReceipt'

interface Props { request: LoanRequest; wallet: string; client: SupabaseClient; onLoanCreated: (id: bigint) => void }
export function RequestCard({ request: r, wallet, client, onLoanCreated }: Props) {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: activeChain.id })
  const { writeContractAsync } = useWriteContract()
  const [interests, setInterests] = useState<LoanInterest[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [recoveryHash, setRecoveryHash] = useState('')
  const [tx, setTx] = useState<`0x${string}` | null>(null)
  const [tick, setTick] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const refresh = useCallback(() => setTick(v => v + 1), [])
  const mine = wallet === r.borrower
  const interest = interests.find(i => i.lender === wallet)
  useEffect(() => {
    let live = true
    void client.from('loan_interests').select('*').eq('request_id', r.id).order('created_at').then(({ data, error: err }) => {
      if (!live) return
      if (err) setError(err.message); else setInterests((data ?? []) as LoanInterest[])
    })
    const channel = client.channel('interest:' + r.id).on('postgres_changes',
      { event: '*', schema: 'public', table: 'loan_interests', filter: 'request_id=eq.' + r.id }, refresh).subscribe()
    const timer = setInterval(refresh, 15000)
    return () => { live = false; clearInterval(timer); void client.removeChannel(channel) }
  }, [client, r.id, tick, refresh])
  const sync = useCallback(async (creationTx?: string) => {
    const { data, error: failure } = await client.functions.invoke('verify-loan', { body: { requestId: r.id, creationTx } }) as { data: { error?: string } | null; error: unknown }
    if (failure || data?.error) throw new Error('Could not verify this loan yet. Keep the creation hash and retry. The verification service must be deployed.')
    refresh()
  }, [client, r.id, refresh])
  useEffect(() => {
    if (!r.creation_tx || r.status === 'repaid' || r.status === 'cancelled') return
    const timer = setInterval(() => { void sync().catch(() => setError('Status sync unavailable. Last verified status is shown; retry below.')) }, 20000)
    return () => clearInterval(timer)
  }, [r.creation_tx, r.status, sync])
  async function action(label: string, work: () => Promise<void>) {
    if (busy) return
    setBusy(label); setError('')
    try { await work() } catch (e) { setError(e instanceof Error ? parseOnchainError(e) : 'Action failed. Please retry.') }
    finally { setBusy('') }
  }
  async function rpc(name: string, params: Record<string, unknown>) {
    const { error: failure } = await client.rpc(name, params)
    if (failure) throw new Error(failure.message)
    refresh()
  }
  async function createAgreement() {
    if (!address || address.toLowerCase() !== r.borrower || chainId !== activeChain.id || !deploymentReady || !publicClient) throw new Error('Connect the borrower wallet on the configured Arc network.')
    const { data: bound, error: failure } = await client.rpc('prepare_loan_binding', { p_request_id: r.id, p_chain_id: activeChain.id }) as { data: LoanRequest | null; error: { message: string } | null }
    if (failure || !bound || !bound.selected_lender) throw new Error(failure?.message ?? 'Invalid agreement response')
    if (bound.contract_address !== LOANBOOK_ADDRESS.toLowerCase()) throw new Error('Deployment configuration mismatch.')
    if (bound.onchain_loan_id) { onLoanCreated(BigInt(bound.onchain_loan_id)); return }
    if (tx) { await sync(tx); return }
    const hash = await writeContractAsync({ account: address, address: LOANBOOK_ADDRESS, abi: LOANBOOK_ABI,
      functionName: 'createLoan', args: [bound.selected_lender as `0x${string}`, parseUsdc(String(r.amount_usdc)), BigInt(r.duration_days) * 86400n], chainId: activeChain.id })
    setTx(hash); setRecoveryHash(hash); setBusy('Confirming agreement…')
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('Agreement transaction reverted.')
    setBusy('Verifying agreement…')
    await sync(hash)
  }
  const overdue = r.status === 'funded' && r.due_at && Date.parse(r.due_at) < now
  const status = overdue ? 'Overdue' : r.status === 'lender_selected' && r.onchain_loan_id ? 'Awaiting funding' : r.status.replace('_',' ')
  return <article className="card p-4 space-y-3" aria-label="Community loan request">
    <div className="flex flex-wrap justify-between gap-2"><strong>{String(r.amount_usdc)} USDC</strong><span className={'status-' + (overdue ? 'overdue' : r.status) + ' text-xs px-2 py-1 rounded-full'}>{status}</span></div>
    <p className="text-xs break-all" style={{color:'var(--muted)'}}>Borrower {r.borrower} · {r.duration_days} days · 0% interest</p>
    {r.note && <p className="text-sm whitespace-pre-wrap break-words">{r.note}</p>}
    {r.status === 'open' && <>
      <p className="text-xs">{interests.length} interested lender{interests.length === 1 ? '' : 's'}</p>
      {!mine && <button className="btn-secondary" disabled={!!busy} onClick={() => { void action('Saving…', () => rpc(interest ? 'withdraw_interest' : 'express_interest', { p_request_id:r.id })) }}>{interest ? 'Withdraw interest' : 'Offer to lend'}</button>}
      {interests.map(i => <div key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
        <span className="mono break-all">{i.lender}</span>
        {mine && <button className="btn-secondary" disabled={!!busy} onClick={() => { void action('Selecting…', () => rpc('update_loan_request_by_borrower', {p_request_id:r.id,p_selected_lender_id:i.lender_id})) }}>Select lender</button>}
      </div>)}
    </>}
    {r.selected_lender && <p className="text-xs break-all"><strong>Selected lender</strong><br/>{r.selected_lender}</p>}
    {mine && r.status === 'lender_selected' && !r.onchain_loan_id && <div className="space-y-2">
      <p className="text-xs" style={{color:'var(--muted)'}}>Confirm the full lender address above. Create the agreement on {activeChain.name}; the lender funds separately. This costs USDC gas.</p>
      {r.binding_started_at && <p className="text-xs">Terms are locked. If you already signed a creation transaction, recover it below before creating another.</p>}
      <button className="btn-primary" disabled={!!busy || !deploymentReady} onClick={() => { void action('Check wallet…', createAgreement) }}>{tx ? 'Retry verification' : 'Create onchain agreement'}</button>
      <label className="block text-xs">Recover a confirmed creation transaction
        <input className="input mt-1 w-full" placeholder="0x… transaction hash" value={recoveryHash} onChange={e => setRecoveryHash(e.target.value)} />
      </label>
      <button className="btn-secondary" disabled={!!busy || !/^0x[0-9a-f]{64}$/i.test(recoveryHash)} onClick={() => { void action('Verifying…', () => sync(recoveryHash)) }}>Verify saved transaction</button>
    </div>}
    {r.onchain_loan_id && <div className="flex flex-wrap gap-2">
      <button className="btn-primary" onClick={() => onLoanCreated(BigInt(r.onchain_loan_id!))} disabled={r.chain_id !== activeChain.id}>Manage loan #{r.onchain_loan_id}</button>
      <button className="btn-secondary" disabled={!!busy} onClick={() => { void action('Checking chain…', () => sync()) }}>Refresh verified status</button>
    </div>}
    {r.chain_id && r.chain_id !== activeChain.id && <p className="text-xs">This loan is on chain {r.chain_id}. Open that network's deployment to manage it.</p>}
    {mine && !r.binding_started_at && ['open','lender_selected'].includes(r.status) && <button className="text-xs underline" disabled={!!busy} onClick={() => { void action('Cancelling…', () => rpc('update_loan_request_by_borrower',{p_request_id:r.id,p_cancel:true})) }}>Cancel request</button>}
    {r.due_at && <p className="text-xs">Repayment due {new Date(r.due_at).toLocaleString()}</p>}
    {tx && <TxReceipt hash={tx} label="Creation submitted" chainId={activeChain.id}/>}
    {(['creation_tx','funding_tx','repayment_tx','cancellation_tx'] as const).map(key => r[key] && <TxReceipt key={key} hash={r[key] as `0x${string}`} label={key.replace('_tx','') + ' verified'} chainId={r.chain_id!}/>)}
    {busy && <p role="status" className="text-xs">{busy}</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {r.verified_block && <p className="text-xs" style={{color:'var(--muted)'}}>Verified through block {r.verified_block}. Blockchain terms are public.</p>}
  </article>
}

