/**
 * GroupView — center panel: tabs for Chat and Loan Requests within a group.
 */
import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, FileText, Plus, Loader2 } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group, LoanRequest } from '../../lib/supabase'
import { ChatPane } from './ChatPane'
import { RequestCard } from './RequestCard'
import { parseUsdc, validateUsdcInput } from '../../loanbook-contract'

type GroupTab = 'chat' | 'requests'

interface Props {
  group: Group
  wallet: string
  client: SupabaseClient
  onLoanCreated: (loanId: bigint) => void
}

export function GroupView({ group, wallet, client, onLoanCreated }: Props) {
  const [tab, setTab] = useState<GroupTab>('chat')
  const [requests, setRequests] = useState<LoanRequest[]>([])
  const [loadingReqs, setLoadingReqs] = useState(true)

  // New request form
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('0.01')
  const [days, setDays] = useState('7')
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [formError, setFormError] = useState('')

  const [refreshCount, setRefreshCount] = useState(0)
  const loadRequests = useCallback(() => setRefreshCount(c => c + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoadingReqs(true)
    client
      .from('loan_requests')
      .select('*')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setRequests((data as LoanRequest[]) ?? [])
        setLoadingReqs(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, group.id, refreshCount])

  // Realtime: new requests appear immediately
  useEffect(() => {
    const channel = client
      .channel(`requests:${group.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loan_requests',
        filter: `group_id=eq.${group.id}`,
      }, () => { void loadRequests() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [client, group.id, loadRequests])

  async function handlePostRequest() {
    setFormError('')
    // LB-018 fix: use bigint-safe validation and parsing — no floating-point
    const amtErr = validateUsdcInput(amount, { min: 10000n }) // min 0.01 USDC
    if (amtErr) { setFormError(amtErr); return }
    const daysNum = parseInt(days, 10)
    if (isNaN(daysNum) || daysNum <= 0 || daysNum > 3650) {
      setFormError('Duration must be between 1 and 3650 days')
      return
    }
    // Store the canonical 6-decimal string representation in the DB
    const amountRaw = parseUsdc(amount)
    const amountStr = (Number(amountRaw) / 1_000_000).toFixed(6) // display-safe: already validated

    setPosting(true)
    const { error } = await client.from('loan_requests').insert({
      group_id: group.id,
      borrower: wallet,
      amount_usdc: amountStr,
      duration_days: daysNum,
      note: note.trim(),
    })
    setPosting(false)

    if (error) { setFormError(error.message); return }
    setShowForm(false)
    setNote('')
    loadRequests()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Group header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="font-semibold text-sm text-white">{group.name}</h2>
          {group.description && (
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{group.description}</p>
          )}
        </div>
        {tab === 'requests' && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-accent-light)' }}
          >
            <Plus size={11} />New request
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.02)' }}
      >
        {(['chat', 'requests'] as GroupTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
            style={{
              color: tab === t ? 'var(--color-accent-light)' : 'var(--color-muted)',
              borderBottom: tab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}
          >
            {t === 'chat' ? <MessageSquare size={12} /> : <FileText size={12} />}
            {t === 'chat' ? 'Chat' : `Requests${requests.length > 0 ? ` (${requests.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'chat' && (
        <div className="flex-1 overflow-hidden">
          <ChatPane groupId={group.id} wallet={wallet} client={client} />
        </div>
      )}

      {tab === 'requests' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* New request form */}
          {showForm && (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              <p className="text-sm font-semibold">Post a loan request</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                No lender address needed. Group members will express interest.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Amount (USDC)</label>
                  <input
                    type="number" min="0.000001" step="0.01"
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full text-sm rounded-xl px-3 py-2 outline-none tabular-nums"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Days</label>
                  <input
                    type="number" min="1" step="1"
                    value={days} onChange={e => setDays(e.target.value)}
                    className="w-full text-sm rounded-xl px-3 py-2 outline-none tabular-nums"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Reason (optional)</label>
                <textarea
                  rows={2} maxLength={300}
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. emergency car repair"
                  className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
              {formError && (
                <p className="text-xs" style={{ color: 'var(--color-red)' }}>{formError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { void handlePostRequest() }}
                  disabled={posting}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 flex items-center justify-center gap-1"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  {posting ? <><Loader2 size={11} className="animate-spin" />Posting…</> : 'Post Request (no gas)'}
                </button>
              </div>
            </div>
          )}

          {/* Request list */}
          {loadingReqs ? (
            <div className="flex justify-center py-6">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-muted)' }} />
            </div>
          ) : requests.length === 0 && !showForm ? (
            <div className="text-center py-8 space-y-2">
              <FileText size={20} className="mx-auto" style={{ color: 'var(--color-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                No loan requests yet.<br />Click "New request" to post one.
              </p>
            </div>
          ) : (
            requests.map(r => (
              <RequestCard
                key={r.id}
                request={r}
                wallet={wallet}
                client={client}
                onLoanCreated={onLoanCreated}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
