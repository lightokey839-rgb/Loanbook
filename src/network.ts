import { defineChain, isAddress, zeroAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
export const arcMainnet = defineChain({
  id: 5042, name: 'Arc Mainnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})
export const isMainnet = import.meta.env.VITE_NETWORK === 'mainnet'
export const activeChain = isMainnet ? arcMainnet : arcTestnet
const configured = (isMainnet ? import.meta.env.VITE_MAINNET_LOANBOOK_ADDRESS : import.meta.env.VITE_TESTNET_LOANBOOK_ADDRESS) as string | undefined
export const contractAddress = (configured || (isMainnet ? zeroAddress : '0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228')) as `0x${string}`
export const deploymentReady = isAddress(contractAddress) && contractAddress !== zeroAddress
export const rpcUrl = isMainnet ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'
export const explorerUrl = isMainnet ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io'
