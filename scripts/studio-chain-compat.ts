/** Preserve exported Studio deploy scripts without a private Studio-only package. */
import { getChainByScpBlockchain, getChain as byId } from '../src/onchain-facts'
export function getChain(name: string) {
 const fact = name === 'Arc_Mainnet' ? byId(5042) : getChainByScpBlockchain(name.replace(/_/g,'-').toUpperCase())
 if (!fact) throw new Error('Unsupported Studio chain: ' + name)
 return { ...fact, explorerUrl: fact.explorerBase }
}

