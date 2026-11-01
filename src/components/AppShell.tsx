/**
 * AppShell — persistent sidebar + top header layout.
 * All pages render as children inside the main content area.
 */
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import {
  LayoutDashboard, Users, BookOpen, Activity, Plus,
  Settings, Menu, X, ChevronRight, Wallet, LogOut,
  ExternalLink, Zap,
} from 'lucide-react'
import { useReadContract, useBalance, useReadContract as useReadContractAlias } from 'wagmi'
import { erc20Abi } from 'viem'
import { activeChain as arcTestnet } from '../network'
import { getUsdc, buildAddressExplorerUrl } from '../onchain-facts'
import { shortAddr, LOANBOOK_ADDRESS, LOANBOOK_ABI } from '../loanbook-contract'
import { useAuth } from '../lib/useAuth'

const USDC = getUsdc(arcTestnet.id)!

export type Page = 'overview' | 'communities' | 'my-loans' | 'activity' | 'direct' | 'lookup' | 'settings'

interface NavItem {
  id: Page
  label: string
  icon: React.ReactNode
  highlight?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',     label: 'Overview',     icon: <LayoutDashboard size={16} /> },
  { id: 'communities',  label: 'Communities',  icon: <Users size={16} /> },
  { id: 'my-loans',     label: 'My Loans',     icon: <BookOpen size={16} /> },
  { id: 'activity',     label: 'Activity',     icon: <Activity size={16} /> },
]

const ADVANCED_ITEMS: NavItem[] = [
  { id: 'direct',  label: 'Direct Loan',  icon: <Zap size={16} /> },
  { id: 'lookup',  label: 'Fund / Repay', icon: <Wallet size={16} /> },
  { id: 'settings',label: 'Settings',    icon: <Settings size={16} /> },
]

interface SidebarProps {
  page: Page
  onNavigate: (id: Page) => void
  onRequestLoan: () => void
  onClose: () => void
  isConnected: boolean
  address?: string
  formattedBalance: string | null
  formattedNative: string | null
  loanCount?: bigint
}

function SidebarContent({
  page, onNavigate, onRequestLoan, onClose,
  isConnected, address, formattedBalance, formattedNative, loanCount,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #22D3EE 100%)',
            fontFamily: 'Space Grotesk',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
          }}
        >
          L
        </div>
        <div>
          <div className="font-bold text-sm leading-none" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.01em' }}>
            LoanBook
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--cyan)' }}>{arcTestnet.name}</div>
        </div>
      </div>

      {/* Request Loan CTA */}
      {isConnected && (
        <div className="px-3 pt-4">
          <button
            onClick={() => { onRequestLoan(); onClose() }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 btn-primary"
          >
            <Plus size={15} />
            Request a Loan
          </button>
        </div>
      )}

      {/* Primary nav */}
      <nav className="flex-1 px-3 pt-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.id); onClose() }}
            className={`nav-item${page === item.id ? ' active' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
            {page === item.id && <ChevronRight size={12} className="ml-auto opacity-50" />}
          </button>
        ))}

        <div className="my-3 border-t" style={{ borderColor: 'var(--border)' }} />
        <p className="px-3 text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
          Advanced
        </p>

        {ADVANCED_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.id); onClose() }}
            className={`nav-item${page === item.id ? ' active' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Wallet / Contract footer */}
      <div className="px-3 pb-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        {isConnected && address ? (
          <div className="card p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                <Wallet size={13} style={{ color: 'var(--accent-light)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mono text-xs truncate" style={{ color: 'var(--ink-2)' }}>{shortAddr(address)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Connected</div>
              </div>
              <a
                href={buildAddressExplorerUrl(arcTestnet.id, address)}
                target="_blank" rel="noopener noreferrer"
                className="p-1 rounded-lg hover:bg-white/5"
                style={{ color: 'var(--muted)' }}
              >
                <ExternalLink size={11} />
              </a>
            </div>
            {formattedBalance !== null && (
              <div
                className="rounded-lg px-2.5 py-1.5 flex justify-between items-center"
                style={{ background: 'rgba(59,130,246,0.07)' }}
                title={formattedNative ? `Native (18 dec): ${formattedNative} USDC` : undefined}
              >
                <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
                <span className="mono text-sm font-semibold tabular-nums" style={{ color: 'var(--accent-light)' }}>
                  {formattedBalance}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <ConnectKitButton />
          </div>
        )}
        <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--subtle)' }}>
          <a
            href={buildAddressExplorerUrl(arcTestnet.id, LOANBOOK_ADDRESS)}
            target="_blank" rel="noopener noreferrer"
            className="mono hover:text-white transition-colors flex items-center gap-1"
          >
            <ExternalLink size={9} />
            {LOANBOOK_ADDRESS.slice(0, 8)}…
          </a>
          {loanCount !== undefined && <span>{loanCount.toString()} loans</span>}
        </div>
      </div>
    </div>
  )
}

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  onRequestLoan: () => void
  children: React.ReactNode
  pageTitle: string
}

export function AppShell({ page, onNavigate, onRequestLoan, children, pageTitle }: Props) {
  const { address, isConnected } = useAccount()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ERC-20 USDC balance (6 dec)
  const { data: erc20Balance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: arcTestnet.id,
    query: { enabled: isConnected && !!address, refetchInterval: 8000 },
  })

  // Native balance (18 dec) — same pool, diagnostic only
  const { data: nativeBalance } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: { enabled: isConnected && !!address, refetchInterval: 8000 },
  })

  // Live loan count
  const { data: loanCount } = useReadContractAlias({
    address: LOANBOOK_ADDRESS,
    abi: LOANBOOK_ABI,
    functionName: 'loanCount',
    chainId: arcTestnet.id,
    query: { refetchInterval: 12000 },
  })

  // Close sidebar on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const formattedBalance = erc20Balance !== undefined
    ? (Number(erc20Balance) / 1_000_000).toFixed(2)
    : null

  const formattedNative = nativeBalance
    ? (Number(nativeBalance.value) / 1e18).toFixed(4)
    : null

  const sidebarProps: SidebarProps = {
    page, onNavigate, onRequestLoan,
    onClose: () => setSidebarOpen(false),
    isConnected, address,
    formattedBalance, formattedNative,
    loanCount,
  }

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-56 shrink-0 fixed top-0 left-0 h-full z-30"
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(8,13,27,0.85)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full z-50 w-64 md:hidden transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
      >
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg"
            style={{ color: 'var(--muted)', background: 'var(--bg-hover)' }}
          >
            <X size={16} />
          </button>
        </div>
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-56">

        {/* Top header */}
        <header
          className="sticky top-0 z-20 flex items-center gap-4 px-4 md:px-6 h-14 shrink-0"
          style={{ background: 'rgba(8,13,27,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}
        >
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg"
            style={{ color: 'var(--muted)', background: 'var(--bg-hover)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Page title */}
          <h1 className="flex-1 text-base font-semibold truncate" style={{ fontFamily: 'Space Grotesk', letterSpacing: '-0.01em' }}>
            {pageTitle}
          </h1>

          {/* Network badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Arc Testnet
          </div>

          {/* USDC balance */}
          {isConnected && formattedBalance !== null && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold tabular-nums"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
              title={formattedNative ? `Native (18 dec): ${formattedNative} USDC — same pool` : undefined}
            >
              {formattedBalance} <span className="font-medium opacity-70">USDC</span>
            </div>
          )}

          {/* Address chip */}
          {isConnected && address && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs mono cursor-default"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              {shortAddr(address)}
            </div>
          )}

          {/* Connect button */}
          <ConnectKitButton />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center"
          style={{
            background: 'rgba(8,13,27,0.95)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {[...NAV_ITEMS.slice(0, 4)].map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors"
              style={{ color: page === item.id ? 'var(--accent-light)' : 'var(--muted)' }}
            >
              <span style={{ opacity: page === item.id ? 1 : 0.6 }}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

/**
 * Standalone auth component for embedding inside the shell's auth context.
 * Provided so CommunityHub can call signOut without prop drilling.
 */
export function useAppAuth() {
  return useAuth()
}

/** Simple hook for signout button in sidebar footer */
export function SignOutButton({ onSignOut }: { onSignOut: () => void }) {
  return (
    <button
      onClick={onSignOut}
      className="nav-item text-xs"
      style={{ color: 'var(--muted)' }}
    >
      <LogOut size={14} />
      Sign out
    </button>
  )
}

