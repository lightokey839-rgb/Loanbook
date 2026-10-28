/**
 * ChatPane — persistent realtime group chat.
 * Messages stored in Supabase, streamed via Supabase Realtime.
 */
import { useState, useEffect, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '../../lib/supabase'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  groupId: string
  wallet: string
  client: SupabaseClient
}

export function ChatPane({ groupId, wallet, client }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load initial messages
  const [refreshCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    client
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setMessages((data as Message[]) ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, groupId, refreshCount])

  // Realtime subscription
  useEffect(() => {
    const channel = client
      .channel(`chat:${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [client, groupId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const body = input.trim()
    if (!body) return
    setSending(true)
    setError('')
    setInput('')

    const { error: err } = await client
      .from('messages')
      .insert({ group_id: groupId, sender: wallet, body })

    if (err) {
      setError(err.message)
      setInput(body) // restore input on failure
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-muted)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-6 text-xs" style={{ color: 'var(--color-muted)' }}>
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map(m => {
            const isMe = m.sender === wallet
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {!isMe && (
                    <span className="text-xs mono" style={{ color: 'var(--color-accent-light)' }}>
                      {shortAddr(m.sender)}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {formatTime(m.created_at)}
                  </span>
                </div>
                <div
                  className="max-w-xs px-3 py-2 rounded-2xl text-sm break-words"
                  style={{
                    background: isMe ? 'var(--color-accent)' : 'rgba(255,255,255,0.07)',
                    color: isMe ? '#fff' : 'var(--color-text)',
                    borderBottomRightRadius: isMe ? '4px' : undefined,
                    borderBottomLeftRadius: !isMe ? '4px' : undefined,
                  }}
                >
                  {m.body}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-xs" style={{ color: 'var(--color-red)' }}>{error}</div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
        <input
          className="flex-1 text-sm rounded-xl px-3 py-2 outline-none"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
          placeholder="Send a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          disabled={sending}
        />
        <button
          onClick={() => { void handleSend() }}
          disabled={sending || !input.trim()}
          className="p-2.5 rounded-xl disabled:opacity-40 transition-opacity"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          {sending
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />
          }
        </button>
      </div>
    </div>
  )
}
