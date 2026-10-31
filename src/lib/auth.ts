/** Native Supabase Web3 auth. Never trust editable user_metadata. */
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getAddress, verifyMessage, type WalletClient } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { getSupabaseClient } from './supabase'
export interface AuthSession { wallet: string; userId: string; client: SupabaseClient }
export class AuthError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthError' }
}
export function verifiedWallet(user: Pick<User, 'identities'>): string | null {
  const identity = user.identities?.find(i => {
    const data = i.identity_data as { custom_claims?: { chain?: unknown } } | undefined
    return i.provider === 'web3' && data?.custom_claims?.chain === 'ethereum'
  })
  const data = identity?.identity_data as { custom_claims?: { address?: unknown } } | undefined
  const address = data?.custom_claims?.address
  return typeof address === 'string' && /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : null
}
export function buildSignInMessage(address: string, chainId: number, origin: string, now = new Date()) {
  if (![5042, 5042002].includes(chainId)) throw new AuthError('Switch to an Arc network before signing in.')
  const url = new URL(origin)
  // Supabase Auth's SIWE parser accepts `localhost` but rejects IP-literal
  // domains such as 127.0.0.1. Keep the signed domain identical to the page
  // origin and direct local users to the registered localhost origin.
  if (url.protocol === 'http:' && url.hostname !== 'localhost') {
    throw new AuthError('Use the registered local URL http://localhost:5173 for wallet sign-in.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AuthError('Wallet sign-in requires HTTPS.')
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return createSiweMessage({
    address: getAddress(address), chainId, domain: url.host, uri: url.origin + pathname,
    version: '1', nonce, issuedAt: now, expirationTime: new Date(now.getTime() + 5 * 60_000),
    statement: 'Sign in to LoanBook private lending circles. This does not authorize a transfer.',
  })
}
export async function authenticateWallet(client: SupabaseClient, connectedAddress: string,
  walletClient: WalletClient, origin: string, stillCurrent: () => boolean = () => true): Promise<AuthSession> {
  const expected = getAddress(connectedAddress)
  const checkAccount = async () => {
    const accounts = await walletClient.getAddresses()
    const providerAddress = accounts[0]
    const clientAddress = walletClient.account?.address
    if (!providerAddress || !stillCurrent() || providerAddress.toLowerCase() !== expected.toLowerCase()) {
      throw new AuthError('Wallet changed. Sign in again with your connected account.')
    }
    // A WalletClient can outlive a connector account switch. Refuse to sign
    // if its bound JSON-RPC account differs from the provider's active account.
    if (clientAddress && clientAddress.toLowerCase() !== providerAddress.toLowerCase()) {
      throw new AuthError('Your wallet connection is stale. Disconnect and reconnect the same account, then try again.')
    }
    return getAddress(providerAddress)
  }
  try {
    const activeAddress = await checkAccount()
    const chainId = await walletClient.getChainId()
    const message = buildSignInMessage(activeAddress, chainId, origin)
    // Use viem's signer instead of manually constructing personal_sign params.
    // This binds the request to the WalletClient's active JSON-RPC account and
    // avoids injected-wallet address-verification mismatches.
    const signature = await walletClient.signMessage({ account: activeAddress, message })
    await checkAccount()
    if (await walletClient.getChainId() !== chainId) throw new AuthError('Network changed. Please sign in again.')
    if (!await verifyMessage({ address: expected, message, signature })) throw new AuthError('Signature does not match the connected wallet.')
    const { data, error } = await client.auth.signInWithWeb3({ chain: 'ethereum', message, signature })
    if (error || !data.session || !data.user) {
      const serverMessage = error?.message ?? ''
      if (/URI which is not allowed|signed for another app/i.test(serverMessage)) {
        const appUrl = new URL(origin)
        const signedUrl = `${appUrl.origin}${appUrl.pathname.endsWith('/') ? appUrl.pathname : `${appUrl.pathname}/`}`
        throw new AuthError(`Supabase has not allowlisted this app URL. Add ${signedUrl} (or a matching wildcard) under Authentication → URL Configuration → Redirect URLs, then retry.`)
      }
      throw new AuthError(serverMessage || 'Sign-in verification failed.')
    }
    if (!stillCurrent() || verifiedWallet(data.user) !== expected.toLowerCase()) {
      await client.auth.signOut({ scope: 'local' })
      throw new AuthError('Session wallet mismatch. Please sign in again.')
    }
    return { wallet: expected.toLowerCase(), userId: data.user.id, client }
  } catch (error) {
    if (error instanceof AuthError) throw error
    const code = (error as { code?: number })?.code
    const message = error instanceof Error ? error.message : ''
    if (code === 4001 || /reject|denied|cancel/i.test(message)) throw new AuthError('Signature cancelled. You can try again.')
    throw new AuthError('Wallet sign-in failed. Check your connection and try again.')
  }
}
export async function signIn(address: string, wallet: WalletClient, stillCurrent?: () => boolean) {
  const client = getSupabaseClient()
  if (!client) throw new AuthError('Communities are not configured yet.')
  return authenticateWallet(client, address, wallet, window.location.origin + window.location.pathname, stillCurrent)
}
export async function signOut(): Promise<void> {
  await getSupabaseClient()?.auth.signOut({ scope: 'local' })
}
export async function restoreSession(expectedWallet: string): Promise<AuthSession | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data: { session }, error } = await client.auth.getSession()
  if (error || !session) return null
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user || verifiedWallet(user) !== expectedWallet.toLowerCase()) {
    await client.auth.signOut({ scope: 'local' }); return null
  }
  return { wallet: expectedWallet.toLowerCase(), userId: user.id, client }
}

