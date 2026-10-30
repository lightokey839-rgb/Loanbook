import { useState } from 'react'
import type { Group } from '../../lib/supabase'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { AuthState } from '../../lib/useAuth'
import { GroupList } from './GroupList'
import { GroupView } from './GroupView'
import { MemberList } from './MemberList'
import { AuthGate } from './AuthGate'
interface Props { auth:AuthState; onLoanCreated:(id:bigint)=>void }
export function CommunityHub({auth,onLoanCreated}:Props){
 const [selected,setSelected]=useState<Group|null>(null)
 const [view,setView]=useState<'groups'|'chat'|'members'>('groups')
 if(!isSupabaseConfigured())return <div className="card p-8 space-y-3"><h2 className="text-xl font-semibold">Your private lending circles</h2><p>Communities are being connected. Direct Loans are available from the sidebar.</p><p className="text-sm" style={{color:'var(--muted)'}}>Create a circle → Invite friends → Request USDC → Find a lender → Fund → Repay.</p></div>
 if(!auth.session||!auth.client)return <AuthGate auth={auth}>{null}</AuthGate>
 const select=(group:Group)=>{setSelected(group);setView('chat')}
 return <AuthGate auth={auth}>
  <div className="space-y-3">
   <p className="text-sm" style={{color:'var(--muted)'}}>Private conversations. Direct USDC loans. Zero interest.</p>
   <div className="lg:hidden flex gap-2">{(['groups','chat','members'] as const).map(v=><button key={v} className={view===v?'btn-primary':'btn-secondary'} disabled={v!=='groups'&&!selected} onClick={()=>setView(v)}>{v==='groups'?'Circles':v==='chat'?'Conversation':'Members'}</button>)}</div>
   <div className="community-layout card overflow-hidden">
    <aside className={view==='groups'?'community-list':'community-list hidden lg:block'}><GroupList wallet={auth.wallet!} client={auth.client} selectedGroupId={selected?.id??null} onSelectGroup={select}/></aside>
    <main className={view==='chat'?'community-chat flex':'community-chat hidden lg:flex'}>{selected?<GroupView key={selected.id} group={selected} wallet={auth.wallet!} client={auth.client} onLoanCreated={onLoanCreated}/>:<div className="m-auto p-8 text-center space-y-3"><h2 className="text-xl font-semibold">Lend within your circle</h2><p className="text-sm" style={{color:'var(--muted)'}}>Create a circle or join with an invitation to start a conversation.</p></div>}</main>
    <aside className={view==='members'?'community-members':'community-members hidden lg:block'}>{selected&&<MemberList key={selected.id} group={selected} wallet={auth.wallet!} client={auth.client} onUpdate={setSelected}/>}</aside>
   </div>
   <div className="flex justify-between text-xs" style={{color:'var(--muted)'}}><span>Signed in · {auth.wallet?.slice(0,6)}…{auth.wallet?.slice(-4)}</span><button onClick={auth.signOut}>Sign out</button></div>
  </div>
 </AuthGate>
}
