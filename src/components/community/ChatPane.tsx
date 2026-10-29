import { useState, useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message, LoanRequest } from '../../lib/supabase'
import { RequestCard } from './RequestCard'
interface Props { groupId: string; wallet: string; client: SupabaseClient; requests?: LoanRequest[]; onLoanCreated: (id:bigint)=>void }
export function ChatPane({ groupId, wallet, client, requests = [], onLoanCreated }: Props) {
  const [messages,setMessages]=useState<Message[]>([])
  const [input,setInput]=useState('')
  const [loading,setLoading]=useState(true)
  const [sending,setSending]=useState(false)
  const [error,setError]=useState('')
  const [liveStatus,setLiveStatus]=useState('Connecting…')
  const [limit,setLimit]=useState(100)
  const [tick,setTick]=useState(0)
  const bottom=useRef<HTMLDivElement>(null)
  const sendLock=useRef(false)
  useEffect(()=>{
    let active=true
    const load=async()=>{
      const {data,error:err}=await client.from('messages').select('*').eq('group_id',groupId).order('created_at',{ascending:false}).limit(limit)
      if(!active)return
      if(err)setError(err.message)
      else {setMessages(((data??[]) as Message[]).reverse());setError('')}
      setLoading(false)
    }
    // Subscribe before snapshot; reload on SUBSCRIBED closes the subscription/snapshot gap.
    const channel=client.channel('chat:'+groupId).on('postgres_changes',
      {event:'INSERT',schema:'public',table:'messages',filter:'group_id=eq.'+groupId},
      ()=>{void load()}).subscribe(status=>{
        if(!active)return
        setLiveStatus(String(status)==='SUBSCRIBED'?'Live':String(status)==='CHANNEL_ERROR'||String(status)==='TIMED_OUT'?'Reconnecting · polling enabled':'Connecting…')
        if(String(status)==='SUBSCRIBED')void load()
      })
    void load()
    const timer=setInterval(()=>{void load()},10000)
    return()=>{active=false;clearInterval(timer);void client.removeChannel(channel)}
  },[client,groupId,limit,tick])
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[messages.length,requests.length])
  async function send(){
    const body=input.trim()
    if(!body||sendLock.current)return
    sendLock.current=true;setSending(true);setError('')
    try {
      const {data,error:err}=await client.rpc('send_message',{p_group_id:groupId,p_body:body}) as {data: Message | null; error: {message:string} | null}
      if(err)throw new Error(err.message)
      setInput('')
      if(data)setMessages(prev=>prev.some(m=>m.id===data.id)?prev:[...prev,data])
      setTick(t=>t+1)
    }catch(e){setError(e instanceof Error?e.message:'Message failed. Try again.')}
    finally{sendLock.current=false;setSending(false)}
  }
  const feed=[...messages.map(m=>({kind:'message' as const,id:m.id,date:m.created_at,value:m})),
    ...requests.map(r=>({kind:'request' as const,id:r.id,date:r.created_at,value:r}))].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
  return <div className="flex flex-col min-h-0 flex-1">
    <div className="px-4 py-2 text-xs" style={{color:'var(--muted)'}} role="status">{liveStatus} · Private conversation</div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-label="Conversation">
      {messages.length>=limit&&<button className="btn-secondary" onClick={()=>setLimit(v=>v+100)}>Load older messages</button>}
      {loading?<p>Loading conversation…</p>:feed.length===0?<p className="text-sm" style={{color:'var(--muted)'}}>Welcome to your circle. Say hello or request a loan.</p>:feed.map(item=>item.kind==='request'
        ?<RequestCard key={item.id} request={item.value} wallet={wallet} client={client} onLoanCreated={onLoanCreated}/>
        :<div key={item.id} className={'flex flex-col '+(item.value.sender===wallet?'items-end':'items-start')}>
          <p className="text-xs mb-1" style={{color:'var(--muted)'}} title={item.value.sender}>{item.value.sender===wallet?'You':item.value.sender.slice(0,6)+'…'+item.value.sender.slice(-4)} · <time dateTime={item.date}>{new Date(item.date).toLocaleString()}</time></p>
          <p className="rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words max-w-[90%]" style={{background:item.value.sender===wallet?'var(--accent)':'var(--bg-card)',overflowWrap:'anywhere'}}>{item.value.body}</p>
        </div>)}
      <div ref={bottom}/>
    </div>
    {error&&<p role="alert" className="text-xs text-red-300 px-4">{error}</p>}
    <form className="p-3 border-t flex gap-2" style={{borderColor:'var(--border)'}} onSubmit={e=>{e.preventDefault();void send()}}>
      <input aria-label="Message" className="input min-w-0 flex-1" placeholder="Message your circle…" maxLength={2000} value={input} disabled={sending} onChange={e=>setInput(e.target.value)}/>
      <button className="btn-primary" disabled={sending||!input.trim()}>{sending?'Sending…':'Send'}</button>
    </form>
  </div>
}
