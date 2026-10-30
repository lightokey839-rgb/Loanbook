import { useEffect } from 'react'
import { useAccount, useReadContract, useBalance } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { activeChain as arcTestnet } from '../network'
import { getUsdc } from '../onchain-facts'
import { shortAddr } from '../loanbook-contract'

const USDC = getUsdc(arcTestnet.id)!

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount()

  // ERC-20 balanceOf — 6 decimals — this is the correct display balance
  const {
    data: erc20Balance,
    refetch: refetchErc20,
  } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: arcTestnet.id,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 8000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  })

  // Native balance — 18 decimals on Arc (same USDC pool, different view)
  // We only use this for diagnostic display; never for money logic.
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address: address,
    chainId: arcTestnet.id,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 8000,
      refetchOnMount: true,
    },
  })

  // Refetch both balances whenever the connected address changes
  useEffect(() => {
    if (!address) return
    refetchErc20().catch(() => {})
    refetchNative().catch(() => {})
  }, [address, refetchErc20, refetchNative])

  const onCorrectChain = chainId === arcTestnet.id

  // ERC-20 USDC: 6 decimals — the balance the user spends on loans
  const formattedErc20 = erc20Balance !== undefined
    ? (Number(erc20Balance) / 1_000_000).toFixed(2)
    : null

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
          style={{ background: 'var(--color-accent)', color: '#fff', fontFamily: 'Space Grotesk' }}
        >
          L
        </div>
        <span className="text-base font-semibold" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.01em' }}>
          LoanBook
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--color-cyan)' }}
        >
          Arc Testnet
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {isConnected && address && (
          <div className="flex items-center gap-2 text-sm">
            {/* Wrong chain warning */}
            {!onCorrectChain && (
              <span
                className="text-xs px-2 py-0.5 rounded-md font-medium"
                style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-red)' }}
              >
                Wrong network
              </span>
            )}

            {/* ERC-20 USDC balance — what the loan flow uses */}
            {onCorrectChain && (
              <span
                className="tabular-nums font-semibold"
                style={{ color: erc20Balance === 0n ? 'var(--color-muted)' : 'var(--color-accent-light)' }}
                title={
                  nativeBalance
                    ? `Native (18 dec): ${(Number(nativeBalance.value) / 1e18).toFixed(6)} USDC\nERC-20 (6 dec): ${formattedErc20} USDC\nBoth views show the same pool.`
                    : `ERC-20 USDC (6 decimals): ${formattedErc20}`
                }
              >
                {formattedErc20 !== null ? `${formattedErc20} USDC` : '…'}
              </span>
            )}

            <span
              className="mono text-xs px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
            >
              {shortAddr(address)}
            </span>
          </div>
        )}
        <ConnectKitButton />
      </div>
    </div>
  )
}
