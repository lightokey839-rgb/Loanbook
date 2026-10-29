/** Built with Arc Studio — https://studio.arc.io */
import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { activeChain, rpcUrl } from './network'
export const config = createConfig({
  chains: [activeChain, mainnet],
  connectors: [injected()],
  transports: { 5042002: http(activeChain.id === 5042002 ? rpcUrl : 'https://rpc.testnet.arc.io'), 5042: http(activeChain.id === 5042 ? rpcUrl : 'https://rpc.mainnet.arc.io'), [mainnet.id]: http() },
})
