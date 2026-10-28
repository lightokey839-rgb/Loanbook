/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Canonical Arc Testnet public RPC — pinned explicitly so wagmi does not
// round-robin across the alternate endpoints in viem's chain definition.
const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, ARC_TESTNET_RPC)

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC),
    [mainnet.id]: http(), // ENS resolution only
  },
})
