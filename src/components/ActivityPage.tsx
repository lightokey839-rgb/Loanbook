import { useEffect,useState } from 'react'
import { usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { LOANBOOK_ADDRESS,LOANBOOK_ABI } from '../loanbook-contract'
import { activeChain } from '../network'
import { TxReceipt } from './TxReceipt'
type Entry={id:string;name:string;loanId:string;hash:`0x${string}`;block:string}
export function ActivityPage(){
 const client=usePublicClient({chainId:activeChain.id})
 const [events,setEvents]=useState<Entry[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[tick,setTick]=useState(0)
 useEffect(()=>{
  let live=true
  async function load(){
   if(!client)return
   setLoading(true);setError('')
   try{
    const head=await client.getBlockNumber(),start=head>19999n?head-19999n:0n
    const rows:Entry[]=[]
    for(let from=start;from<=head;from+=5000n){
     const logs=await client.getLogs({address:LOANBOOK_ADDRESS,fromBlock:from,toBlock:from+4999n<head?from+4999n:head})
     for(const log of logs)try{
      const event=decodeEventLog({abi:LOANBOOK_ABI,data:log.data,topics:log.topics})
      if('loanId' in event.args)rows.push({id:log.transactionHash+':'+log.logIndex,name:event.eventName,loanId:String(event.args.loanId),hash:log.transactionHash,block:String(log.blockNumber)})
     }catch{/* Other contract events are not lending activity. */}
    }
    if(live)setEvents(rows.reverse())
   }catch{if(live)setError('Could not load Arc activity. Please retry.')}
   finally{if(live)setLoading(false)}
  }
  void load()
  return()=>{live=false}
 },[client,tick])
 return <section className="max-w-3xl mx-auto space-y-4"><div className="flex justify-between items-center"><h2 className="text-xl font-semibold">Verified contract activity</h2><button className="btn-secondary" onClick={()=>setTick(v=>v+1)}>Refresh</button></div><p className="text-sm" style={{color:'var(--muted)'}}>Events from the latest 20,000 blocks on {activeChain.name}. These are public onchain records.</p>
 {loading?<p role="status">Reading Arc…</p>:error?<p role="alert" className="text-red-300">{error}</p>:events.length===0?<div className="card p-6">No recent loan events.</div>:events.map(e=><article className="card p-4 space-y-2" key={e.id}><p className="font-semibold">Loan #{e.loanId} · {e.name.replace('Loan','')}</p><p className="text-xs" style={{color:'var(--muted)'}}>Block {e.block}</p><TxReceipt hash={e.hash} label="Confirmed transaction" chainId={activeChain.id}/></article>)}
 </section>
}
