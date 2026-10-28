/**
 * LoanBook auth server — Bun HTTP
 *
 * Routes:
 *   POST /nonce    { wallet } → { nonce, message, expiresAt }
 *   POST /verify   { wallet, signature, nonce } → { token, wallet }
 *   GET  /health   → { ok: true }
 *
 * Security fixes applied (see BUGS.md LB-013 through LB-015):
 *
 * LB-013 — Message stored in DB on /nonce and retrieved verbatim on /verify.
 *   The old code re-called buildSiweMessage() during verification, generating
 *   a new Issued At timestamp. The recovered signer never matched because the
 *   signed bytes differed. Fix: store message text in the nonces row at /nonce
 *   time and read it back at /verify time.
 *
 * LB-014 — Atomic nonce consumption via a Postgres function.
 *   The old code did SELECT … then UPDATE used=true in two separate round-
 *   trips. A concurrent replay could pass both selects before either update
 *   committed. Fix: a single consume_nonce(p_nonce, p_wallet) DB function uses
 *   UPDATE … RETURNING with FOR UPDATE SKIP LOCKED; only one concurrent call
 *   wins the row.
 *
 * LB-015 — CORS restricted to configured origin in production.
 *   Wildcard Access-Control-Allow-Origin is replaced with an explicit allowlist
 *   derived from APP_DOMAIN. Development localhost is always allowed; the
 *   configured domain is allowed when present.
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

// ── Environment ────────────────────────────────────────────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SUPABASE_JWT_SECRET  = process.env.SUPABASE_JWT_SECRET  ?? ''
const APP_DOMAIN           = process.env.APP_DOMAIN           ?? 'localhost'
const PORT                 = parseInt(process.env.AUTH_PORT   ?? '3001', 10)
const NODE_ENV             = process.env.NODE_ENV             ?? 'development'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_JWT_SECRET) {
  console.error('[auth] FATAL: Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET')
  process.exit(1)
}

// Service-role client — bypasses RLS (nonce management only)
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── CORS allowlist (LB-015) ────────────────────────────────────────────────

/**
 * Compute allowed origins from APP_DOMAIN.
 * Always allow localhost in development.
 * In production, only allow the configured domain.
 */
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>()
  // Always allow the Vite proxy (same origin in dev, same domain in prod)
  if (NODE_ENV !== 'production') {
    origins.add('http://localhost:5173')
    origins.add('http://localhost:3000')
    origins.add('http://127.0.0.1:5173')
  }
  if (APP_DOMAIN && APP_DOMAIN !== 'localhost') {
    origins.add(`https://${APP_DOMAIN}`)
    origins.add(`http://${APP_DOMAIN}`)
  } else {
    origins.add('http://localhost:5173')
    origins.add('http://localhost:3000')
  }
  return origins
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const origin = (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) ? reqOrigin : [...ALLOWED_ORIGINS][0]
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build a SIWE-compatible message.
 * The exact text this function produces is stored in the DB and retrieved
 * verbatim for verification — never reconstructed.
 */
function buildSiweMessage(wallet: string, nonce: string, domain: string): string {
  const issuedAt  = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    wallet,
    '',
    'Sign in to LoanBook. This request will not trigger a blockchain transaction or cost gas.',
    '',
    `URI: https://${domain}`,
    'Version: 1',
    `Chain ID: 5042002`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join('\n')
}

/** Recover the signer address from a personal_sign (EIP-191) message + signature */
async function recoverAddress(message: string, signature: string): Promise<string> {
  const { recoverMessageAddress } = await import('viem')
  const address = await recoverMessageAddress({
    message,
    signature: signature as `0x${string}`,
  })
  return address.toLowerCase()
}

/** Sign a minimal JWT (HS256) compatible with Supabase RLS */
function signJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = createHmac('sha256', SUPABASE_JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${sig}`
}

// ── Response helpers ───────────────────────────────────────────────────────

function json(data: unknown, status: number, origin: string | null): Response {
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  }
  return new Response(JSON.stringify(data), { status, headers })
}

// ── Route handlers ─────────────────────────────────────────────────────────

async function handleNonce(req: Request, origin: string | null): Promise<Response> {
  let body: { wallet?: string }
  try {
    body = await req.json() as { wallet?: string }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin)
  }

  const { wallet } = body
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return json({ error: 'Invalid wallet address' }, 400, origin)
  }
  const norm    = wallet.toLowerCase()
  const nonce   = randomHex(32) // 64-char hex — cryptographically unpredictable
  const expires = new Date(Date.now() + 5 * 60 * 1000)

  // Build the exact message the wallet will sign.
  // FIX (LB-013): store the message text in the nonces row so /verify can
  // retrieve it verbatim rather than reconstructing it with a different timestamp.
  const message = buildSiweMessage(norm, nonce, APP_DOMAIN)

  const { error } = await supa.from('nonces').insert({
    wallet:     norm,
    nonce:      nonce,
    message:    message,          // stored verbatim
    expires_at: expires.toISOString(),
    used:       false,
  })

  if (error) {
    console.error('[auth] nonce insert error:', error.message)
    return json({ error: 'Server error' }, 500, origin)
  }

  // Clean up expired nonces in the background (best-effort)
  supa.from('nonces')
    .delete()
    .lt('expires_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .then(() => {})
    .catch(() => {})

  return json({ nonce, message, expiresAt: expires.toISOString() }, 200, origin)
}

async function handleVerify(req: Request, origin: string | null): Promise<Response> {
  let body: { wallet?: string; signature?: string; nonce?: string }
  try {
    body = await req.json() as { wallet?: string; signature?: string; nonce?: string }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin)
  }

  const { wallet, signature, nonce } = body
  if (!wallet || !signature || !nonce) {
    return json({ error: 'Missing fields: wallet, signature, nonce required' }, 400, origin)
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return json({ error: 'Invalid wallet address' }, 400, origin)
  }
  if (!/^[0-9a-f]{64}$/.test(nonce)) {
    return json({ error: 'Invalid nonce format' }, 400, origin)
  }

  const norm = wallet.toLowerCase()

  // FIX (LB-014): atomic nonce consumption — calls a DB function that does
  //   UPDATE nonces SET used=true WHERE nonce=? AND wallet=? AND used=false
  //     AND expires_at > now()
  //   RETURNING message
  // in a single statement. Only one concurrent caller wins the row.
  const { data: consumeResult, error: consumeErr } = await supa
    .rpc('consume_nonce', { p_nonce: nonce, p_wallet: norm }) as {
      data: { message: string } | null
      error: { message: string } | null
    }

  if (consumeErr || !consumeResult) {
    // Distinguishable error for expired vs already-used vs not-found
    return json({ error: 'Invalid or expired nonce' }, 401, origin)
  }

  // FIX (LB-013): use the stored message, not a freshly-generated one
  const storedMessage = consumeResult.message
  if (!storedMessage) {
    return json({ error: 'Nonce message missing — request a new nonce' }, 401, origin)
  }

  // Recover signer from the EXACT bytes the wallet signed
  let recovered: string
  try {
    recovered = await recoverAddress(storedMessage, signature)
  } catch {
    return json({ error: 'Signature recovery failed' }, 401, origin)
  }

  if (recovered !== norm) {
    return json({ error: 'Signature does not match wallet' }, 401, origin)
  }

  // Upsert profile (idempotent)
  await supa
    .from('profiles')
    .upsert({ wallet: norm }, { onConflict: 'wallet', ignoreDuplicates: true })

  // Issue JWT — wallet claim used by RLS policies
  const now = Math.floor(Date.now() / 1000)
  const token = signJwt({
    iss:    'supabase',
    sub:    norm,           // standard JWT subject
    aud:    'authenticated',
    role:   'authenticated',
    wallet: norm,           // custom claim read by RLS policies
    iat:    now,
    exp:    now + 60 * 60 * 24, // 24-hour session
  })

  return json({ token, wallet: norm }, 200, origin)
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url    = new URL(req.url)
    const origin = req.headers.get('origin')

    // Handle CORS pre-flight for all routes
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      })
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      return json({ ok: true, env: NODE_ENV }, 200, origin)
    }

    if (url.pathname === '/nonce' && req.method === 'POST') {
      return handleNonce(req, origin)
    }

    if (url.pathname === '/verify' && req.method === 'POST') {
      return handleVerify(req, origin)
    }

    return json({ error: 'Not found' }, 404, origin)
  },
})

console.log(`[auth] LoanBook auth server running on http://localhost:${server.port} (${NODE_ENV})`)
console.log(`[auth] Allowed origins: ${[...ALLOWED_ORIGINS].join(', ')}`)
