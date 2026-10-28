import { ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '../onchain-facts'

interface Props {
  hash: string | undefined
  label: string
  chainId: number
}

export function TxReceipt({ hash, label, chainId }: Props) {
  if (!hash) return null
  const url = buildTxExplorerUrl(chainId, hash)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 transition-colors hover:opacity-80"
      style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--color-accent-light)' }}
    >
      <ExternalLink size={12} />
      <span>{label}:</span>
      <span className="mono truncate max-w-[180px]">{hash}</span>
    </a>
  )
}
