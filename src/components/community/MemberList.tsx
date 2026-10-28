import { useState, useEffect } from 'react'
import { Copy, Check, Crown, User } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group, GroupMember } from '../../lib/supabase'

interface Props {
  group: Group
  wallet: string
  client: SupabaseClient
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function MemberList({ group, wallet, client }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const [refreshCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    client
      .from('group_members')
      .select('*')
      .eq('group_id', group.id)
      .order('joined_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setMembers((data as GroupMember[]) ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, group.id, refreshCount])

  function copyInvite() {
    void navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isOwner = wallet === group.owner

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          Members · {members.length}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-xs" style={{ color: 'var(--color-muted)' }}>Loading…</div>
        ) : (
          members.map(m => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{ background: m.role === 'owner' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.12)' }}
              >
                {m.role === 'owner'
                  ? <Crown size={10} style={{ color: 'var(--color-yellow)' }} />
                  : <User size={10} style={{ color: 'var(--color-accent-light)' }} />
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs mono truncate" style={{ color: m.wallet === wallet ? 'var(--color-accent-light)' : 'var(--color-text)' }}>
                  {shortAddr(m.wallet)}
                  {m.wallet === wallet && <span className="ml-1 text-xs" style={{ color: 'var(--color-muted)' }}>(you)</span>}
                </p>
              </div>
              {m.role === 'owner' && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-yellow)' }}>
                  owner
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Invite section — only visible to owner */}
      {isOwner && (
        <div className="px-3 py-3 border-t space-y-2" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Invite code</p>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
          >
            <span className="text-xs mono flex-1 truncate" style={{ color: 'var(--color-accent-light)' }}>
              {group.invite_code}
            </span>
            <button onClick={copyInvite} className="flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
              {copied ? <Check size={12} style={{ color: 'var(--color-green)' }} /> : <Copy size={12} />}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Share this code. Members join from the "Join Group" button.
          </p>
        </div>
      )}
    </div>
  )
}
