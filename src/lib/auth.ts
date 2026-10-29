/** Native Supabase Web3 auth. Never trust editable user_metadata. */
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getAddress, stringToHex, verifyMessage, type WalletClient } from 'viem'
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
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new AuthError('Wallet sign-in requires HTTPS.')
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
  return createSiweMessage({
    address: getAddress(address), chainId, domain: url.host, uri: url.origin + '/',
    version: '1', nonce, issuedAt: now, expirationTime: new Date(now.getTime() + 5 * 60_000),
    statement: 'Sign in to LoanBook private lending circles. This does not authorize a transfer.',
  })
}
export async function authenticateWallet(client: SupabaseClient, connectedAddress: string,
  walletClient: WalletClient, origin: string, stillCurrent: () => boolean = () => true): Promise<AuthSession> {
  const expected = getAddress(connectedAddress)
  const checkAccount = async () => {
    const accounts = await walletClient.getAddresses()
    if (!stillCurrent() || accounts[0]?.toLowerCase() !== expected.toLowerCase()) {
      throw new AuthError('Wallet changed. Sign in again with your connected account.')
    }
  }
  try {
    await checkAccount()
    const chainId = await walletClient.getChainId()
    const message = buildSignInMessage(expected, chainId, origin)
    // Explicit message avoids SDK paths that omit Nonce. EIP-1193 order: [hex message, address].
    const signature = await walletClient.request({ method: 'personal_sign', params: [stringToHex(message), expected] })
    await checkAccount()
    if (await walletClient.getChainId() !== chainId) throw new AuthError('Network changed. Please sign in again.')
    if (!await verifyMessage({ address: expected, message, signature })) throw new AuthError('Signature does not match the connected wallet.')
    const { data, error } = await client.auth.signInWithWeb3({ chain: 'ethereum', message, signature })
    if (error || !data.session || !data.user) throw new AuthError(error?.message ?? 'Sign-in verification failed.')
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
  return authenticateWallet(client, address, wallet, window.location.origin, stillCurrent)
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
