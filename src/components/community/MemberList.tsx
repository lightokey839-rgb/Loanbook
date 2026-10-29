import { useState,useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group,GroupMember } from '../../lib/supabase'
import { inviteLink } from '../../lib/invites'
interface Props {group:Group;wallet:string;client:SupabaseClient;onUpdate:(group:Group)=>void}
export function MemberList({group,wallet,client,onUpdate}:Props){
 const [members,setMembers]=useState<GroupMember[]>([]),[error,setError]=useState(''),[copied,setCopied]=useState('')
 const [name,setName]=useState(group.name),[description,setDescription]=useState(group.description??''),[saving,setSaving]=useState(false)
 useEffect(()=>{
  let live=true
  const load=async()=>{const {data,error:err}=await client.from('group_members').select('*').eq('group_id',group.id).order('joined_at')
   if(live){if(err)setError(err.message);else setMembers((data??[]) as GroupMember[])}}
  const ch=client.channel('members:'+group.id).on('postgres_changes',{event:'*',schema:'public',table:'group_members',filter:'group_id=eq.'+group.id},()=>{void load()}).subscribe()
  void load();const timer=setInterval(()=>{void load()},10000)
  return()=>{live=false;clearInterval(timer);void client.removeChannel(ch)}
 },[client,group.id])
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied('Copied')}catch{setError('Copy unavailable. Select and copy the invitation below.')}}
 async function save(){setSaving(true);setError('');try{const {data,error:err}=await client.rpc('update_group_metadata',{p_group_id:group.id,p_name:name.trim(),p_description:description.trim()}) as {data:Group|null;error:{message:string}|null};if(err)throw new Error(err.message);if(data)onUpdate(data)}catch(e){setError(e instanceof Error?e.message:'Save failed')}finally{setSaving(false)}}
 return <div className="p-4 space-y-4 text-sm">
  <h3 className="font-semibold">Members · {members.length}</h3>
  {members.map(m=><div key={m.id} className="text-xs break-all"><span title={m.wallet}>{m.wallet.slice(0,6)}…{m.wallet.slice(-4)}</span> {m.wallet===wallet?'· you':''} {m.role==='owner'?'· owner':''}</div>)}
  {wallet===group.owner&&<>
   <h3 className="font-semibold pt-2">Invite trusted people</h3>
   <p className="text-xs" style={{color:'var(--muted)'}}>Anyone with this invitation can join. Share it privately.</p>
   <input aria-label="Invite link" className="input w-full text-xs" readOnly value={inviteLink(group.invite_code)}/>
   <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>{void copy(inviteLink(group.invite_code))}}>Copy link</button><button className="btn-secondary" onClick={()=>{void copy(group.invite_code)}}>Copy code</button></div>
   {copied&&<p role="status" className="text-xs">{copied}</p>}
   <form className="space-y-2" onSubmit={e=>{e.preventDefault();void save()}}>
    <h3 className="font-semibold pt-2">Circle details</h3>
    <label className="block text-xs">Name<input className="input w-full mt-1" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block text-xs">Description<textarea className="input w-full mt-1" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <button className="btn-primary" disabled={saving||!name.trim()}>{saving?'Saving…':'Save details'}</button>
   </form>
  </>}
  {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
 </div>
}
