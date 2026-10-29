import { useAccount,useSwitchChain } from 'wagmi'
import { activeChain, deploymentReady, isMainnet } from '../network'
export function NetworkGuard({children}:{children:React.ReactNode}){
 const {isConnected,chainId}=useAccount()
 const {switchChain,isPending,error}=useSwitchChain()
 if(!deploymentReady)return <div className="max-w-xl mx-auto card p-8 my-12 space-y-3"><h1 className="text-xl font-semibold">Mainnet deployment is not configured</h1><p>LoanBook is waiting for a verified mainnet contract address. No loan transactions are available on this build.</p></div>
 if(isConnected&&chainId!==activeChain.id)return <div className="max-w-lg mx-auto card p-8 my-12 space-y-4"><h2 className="text-xl font-semibold">Switch to {activeChain.name}</h2><p>Your wallet is on chain {chainId}. This app uses chain {activeChain.id}.</p><button className="btn-primary" disabled={isPending} onClick={()=>switchChain({chainId:activeChain.id})}>{isPending?'Switching…':'Switch network'}</button>{error&&<p role="alert" className="text-red-300 text-sm">Network switch was not completed. Try again in your wallet.</p>}</div>
 return <>{isMainnet&&<div className="text-center text-xs bg-amber-950 text-amber-200 p-2">Arc Mainnet · Real USDC · Review every wallet approval and transaction.</div>}{children}</>
}
