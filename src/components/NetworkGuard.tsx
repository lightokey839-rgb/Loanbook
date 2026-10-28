import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'

interface Props { children: React.ReactNode }

export function NetworkGuard({ children }: Props) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected) return <>{children}</>

  if (chainId !== arcTestnet.id) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1b2e]/90 backdrop-blur-sm p-4">
        <div className="glass max-w-sm w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-yellow-500/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'Space Grotesk' }}>Wrong Network</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            LoanBook runs on <strong className="text-white">Arc Testnet</strong> (chain ID 5042002).
            You are connected to chain {chainId}.
          </p>
          <button
            onClick={() => switchChain({ chainId: arcTestnet.id })}
            disabled={isPending}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all"
            style={{ background: 'var(--color-accent)', color: '#fff', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? 'Switching…' : 'Switch to Arc Testnet'}
          </button>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            RPC: <span className="mono">https://rpc.testnet.arc.io</span> · Chain ID: <span className="mono">5042002</span>
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
