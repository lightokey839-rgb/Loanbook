/**
 * GroupList — shows the user's groups and lets them create or join one.
 */
import { useState, useEffect, useCallback } from 'react'
import { Plus, Link2, Users, Loader2, LogIn } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group } from '../../lib/supabase'

interface Props {
  wallet: string
  client: SupabaseClient
  selectedGroupId: string | null
  onSelectGroup: (group: Group) => void
}

export function GroupList({ wallet, client, selectedGroupId, onSelectGroup }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create group state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Join group state
  const [showJoin, setShowJoin] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const [refreshCount, setRefreshCount] = useState(0)
  const loadGroups = useCallback(() => setRefreshCount(c => c + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    client
      .from('group_members')
      .select('groups(*)')
      .eq('wallet', wallet)
      .order('joined_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        const gs = ((data ?? []) as { groups: Group | Group[] | null }[])
          .map(row => (Array.isArray(row.groups) ? row.groups[0] : row.groups))
          .filter((g): g is Group => g !== null && g !== undefined)
        setGroups(gs)
        setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, wallet, refreshCount])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setError('')

    // 1. Insert group
    const createResult = await client
      .from('groups')
      .insert({ name: newName.trim(), description: newDesc.trim() || null, owner: wallet })
      .select()
      .single()
    const gErr = createResult.error
    const group = createResult.data as Group | null

    if (gErr || !group) {
      setError(gErr?.message ?? 'Failed to create group')
      setCreating(false)
      return
    }

    // 2. Add creator as owner member
    const { error: mErr } = await client
      .from('group_members')
      .insert({ group_id: group.id, wallet, role: 'owner' })

    if (mErr) { setError(mErr.message); setCreating(false); return }

    setShowCreate(false)
    setNewName('')
    setNewDesc('')
    setCreating(false)
    loadGroups()
    onSelectGroup(group)
  }

  async function handleJoin() {
    const code = inviteInput.trim()
    if (!code) return
    setJoining(true)
    setJoinError('')

    // LB-016 fix: use server-enforced join_group_by_invite RPC function.
    // The old code did: find group by invite_code, check membership, insert.
    // This was vulnerable because the RLS insert policy allowed any
    // authenticated wallet to join any group whose UUID they knew — the
    // invite code was only checked client-side.
    // The new DB function verifies the invite code AND membership in one
    // atomic server-side call (security definer).
    const { data: groupId, error: rpcErr } = await client
      .rpc('join_group_by_invite', { p_invite_code: code, p_wallet: wallet }) as {
        data: string | null
        error: { message: string } | null
      }

    if (rpcErr || !groupId) {
      const hint = rpcErr?.message ?? ''
      if (hint.includes('not_found')) {
        setJoinError('Invite code not found.')
      } else if (hint.includes('forbidden')) {
        setJoinError('Session mismatch — please sign out and sign in again.')
      } else {
        setJoinError(hint || 'Failed to join group.')
      }
      setJoining(false)
      return
    }

    // Fetch the group details so we can pass them to onSelectGroup
    const groupResult = await client.from('groups').select('*').eq('id', groupId).single()
    const group = groupResult.data as Group | null

    setShowJoin(false)
    setInviteInput('')
    setJoining(false)
    loadGroups()
    if (group) onSelectGroup(group)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          Your Groups
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => { setShowJoin(v => !v); setShowCreate(false) }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: showJoin ? 'rgba(59,130,246,0.15)' : 'transparent', color: 'var(--color-muted)' }}
            title="Join group"
          >
            <LogIn size={14} />
          </button>
          <button
            onClick={() => { setShowCreate(v => !v); setShowJoin(false) }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: showCreate ? 'rgba(59,130,246,0.15)' : 'transparent', color: 'var(--color-muted)' }}
            title="New group"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-3 py-3 space-y-2 border-b" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'var(--color-border)' }}>
          <input
            className="w-full text-xs rounded-lg px-3 py-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="Group name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            className="w-full text-xs rounded-lg px-3 py-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <button
            onClick={() => { void handleCreate() }}
            disabled={creating || !newName.trim()}
            className="w-full text-xs py-2 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            {creating ? <><Loader2 size={11} className="animate-spin" />Creating…</> : 'Create Group'}
          </button>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="px-3 py-3 space-y-2 border-b" style={{ background: 'rgba(6,182,212,0.04)', borderColor: 'var(--color-border)' }}>
          <input
            className="w-full text-xs rounded-lg px-3 py-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="Invite code"
            value={inviteInput}
            onChange={e => setInviteInput(e.target.value)}
          />
          {joinError && <p className="text-xs" style={{ color: 'var(--color-red)' }}>{joinError}</p>}
          <button
            onClick={() => { void handleJoin() }}
            disabled={joining || !inviteInput.trim()}
            className="w-full text-xs py-2 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
            style={{ background: 'var(--color-cyan)', color: '#fff' }}
          >
            {joining ? <><Loader2 size={11} className="animate-spin" />Joining…</> : 'Join Group'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-red)' }}>{error}</div>
      )}

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-muted)' }} />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
            No groups yet.<br />Create one or join with an invite code.
          </div>
        ) : (
          groups.map(g => (
            <button
              key={g.id}
              onClick={() => onSelectGroup(g)}
              className="w-full text-left px-3 py-3 flex items-center gap-2 transition-colors"
              style={{
                background: selectedGroupId === g.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                borderLeft: selectedGroupId === g.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.2)', color: 'var(--color-accent-light)' }}
              >
                {g.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate text-white">{g.name}</p>
                {g.description && (
                  <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>{g.description}</p>
                )}
              </div>
              <Users size={11} className="ml-auto flex-shrink-0" style={{ color: 'var(--color-muted)' }} />
            </button>
          ))
        )}
      </div>

      {/* Invite link reminder */}
      {groups.length > 0 && (
        <div
          className="px-3 py-2 text-xs flex items-center gap-1 border-t"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
        >
          <Link2 size={10} />
          Share invite code from group settings to add members.
        </div>
      )}
    </div>
  )
}
