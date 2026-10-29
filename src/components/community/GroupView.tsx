import { useState,useEffect } from 'react'
import { formatUnits } from 'viem'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group,LoanRequest } from '../../lib/supabase'
import { ChatPane } from './ChatPane'
import { parseUsdc,validateUsdcInput } from '../../loanbook-contract'
interface Props {group:Group;wallet:string;client:SupabaseClient;onLoanCreated:(id:bigint)=>void}
export function GroupView({group,wallet,client,onLoanCreated}:Props){
 const [requests,setRequests]=useState<LoanRequest[]>([])
 const [show,setShow]=useState(false),[amount,setAmount]=useState('0.01'),[days,setDays]=useState('7'),[note,setNote]=useState('')
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0)
 useEffect(()=>{
  let live=true
  const load=async()=>{
   const {data,error:err}=await client.from('loan_requests').select('*').eq('group_id',group.id).order('created_at',{ascending:false})
   if(live){if(err)setError(err.message);else setRequests((data??[]) as LoanRequest[])}
  }
  const channel=client.channel('requests:'+group.id).on('postgres_changes',{event:'*',schema:'public',table:'loan_requests',filter:'group_id=eq.'+group.id},()=>{void load()}).subscribe(s=>{if(String(s)==='SUBSCRIBED')void load()})
  void load();const timer=setInterval(()=>{void load()},15000)
  return()=>{live=false;clearInterval(timer);void client.removeChannel(channel)}
 },[client,group.id,tick])
 async function post(){
  const err=validateUsdcInput(amount,{min:10000n})
  if(err){setError(err);return}
  if(!/^\d+$/.test(days)||Number(days)<1||Number(days)>3650){setError('Choose 1–3650 whole days.');return}
  // Safe JSON numeric range at 6 decimals; SQL enforces the same cap.
  if(parseUsdc(amount)>1_000_000_000000n){setError('Maximum request is 1,000,000 USDC.');return}
  setBusy(true);setError('')
  try{
   const {error:failure}=await client.rpc('post_loan_request',{p_group_id:group.id,p_amount_usdc:formatUnits(parseUsdc(amount),6),p_duration:Number(days),p_note:note.trim()})
   if(failure)throw new Error(failure.message)
   setShow(false);setNote('');setTick(v=>v+1)
  }catch(e){setError(e instanceof Error?e.message:'Request failed.')}
  finally{setBusy(false)}
 }
 return <section className="flex flex-col h-full min-h-0">
  <header className="p-4 border-b flex items-center justify-between gap-2" style={{borderColor:'var(--border)'}}>
   <div className="min-w-0"><h2 className="font-semibold truncate">{group.name}</h2><p className="text-xs break-words" style={{color:'var(--muted)'}}>{group.description||'Your private lending circle'}</p></div>
   <button className="btn-secondary shrink-0" onClick={()=>setShow(!show)}>Request USDC</button>
  </header>
  {show&&<form className="p-4 space-y-3 border-b" style={{borderColor:'var(--border)'}} onSubmit={e=>{e.preventDefault();void post()}}>
   <p className="text-sm font-semibold">Ask your circle · no gas to post</p>
   <div className="flex gap-3"><label className="text-xs flex-1">USDC amount<input className="input w-full mt-1" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="text-xs w-24">Days<input className="input w-full mt-1" type="number" min="1" max="3650" value={days} onChange={e=>setDays(e.target.value)}/></label></div>
   <label className="text-xs block">What is the loan for?<textarea className="input w-full mt-1" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} rows={2}/></label>
   <button className="btn-primary" disabled={busy}>{busy?'Posting…':'Post request'}</button>
  </form>}
  {error&&<p role="alert" className="text-xs text-red-300 p-3">{error}</p>}
  <ChatPane key={group.id} groupId={group.id} wallet={wallet} client={client} requests={requests} onLoanCreated={onLoanCreated}/>
 </section>
}
