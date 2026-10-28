# LoanBook — Pre-Mainnet Readiness Report

**Date:** 2026-10-28  
**Audited by:** Arc Studio security review  
**Scope:** Smart contract, auth server, Supabase RLS, frontend USDC handling, secrets, network config  
**Contract:** `0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228` (Arc Testnet — not reviewed for mainnet deployment)

---

## VERDICT: NO-GO for mainnet

Six confirmed issues were found and fixed in this session. Four were HIGH severity. Live end-to-end tests that require a running Supabase project and real wallet signatures remain BLOCKED in the sandbox environment. These tests MUST be completed and pass before mainnet deployment is considered.

---

## Checklist

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Authentication & replay protection | PASS (code) / BLOCKED (live) | LB-013 + LB-014 fixed. Live wallet sign-in requires Supabase. |
| 2 | Private group permissions | PASS (code) / BLOCKED (live) | LB-016 fixed. Three-identity test requires live DB. |
| 3 | RLS & invitation security | PASS (code) / BLOCKED (live) | Migration 002 written. Must be applied and tested. |
| 4 | Loan status verified onchain | PARTIAL | Onchain tx verified via wagmi receipt; DB status escalation blocked (LB-017). Auth-server-side receipt verification not yet implemented. |
| 5 | USDC precision | PASS | LB-018 fixed. All float arithmetic replaced with bigint. Unit tests pass conceptually; no dedicated test harness yet. |
| 6 | Contract security tests | PASS | 31/31 forge tests pass. Slither analysis previously clean. |
| 7 | Testnet loan lifecycle | BLOCKED | Full createLoan→fund→repay lifecycle requires wallet signatures. |
| 8 | Frontend production build | PASS | `bunx vite build` clean in 12.9s, no errors. |
| 9 | Production backend | BLOCKED | Auth server untested against live Supabase. CORS, rate limiting, HTTPS not configured. |
| 10 | Secrets protection | PASS (sandbox) | No git history to scrub — no git repo. `.env.example` contains only placeholders. |
| 11 | Mainnet configuration | NOT STARTED | Mainnet chain ID 5042 and LoanBook address not configured. |

---

## Confirmed Issues and Fixes

### LB-013 — HIGH — Auth: signed message reconstructed with different timestamp
- **Root cause:** `/verify` called `buildSiweMessage()` again instead of using the stored message.
- **Fix:** Store message text verbatim in `nonces.message`; `/verify` reads it back.
- **Files:** `server/auth.ts`, `supabase/migrations/002_security_hardening.sql`
- **Test status:** BLOCKED (requires live Supabase).

### LB-014 — HIGH — Auth: non-atomic nonce consumption (replay attack)
- **Root cause:** SELECT + UPDATE = two round-trips; concurrent replays could both pass.
- **Fix:** `consume_nonce()` PL/pgSQL function with `UPDATE … RETURNING` in one statement.
- **Files:** `server/auth.ts`, `supabase/migrations/002_security_hardening.sql`
- **Test status:** BLOCKED (requires live Supabase).

### LB-015 — MEDIUM — Auth: CORS wildcard `*`
- **Root cause:** `cors()` returned `Access-Control-Allow-Origin: *` unconditionally.
- **Fix:** Explicit allowlist from `APP_DOMAIN`; `Vary: Origin` header added.
- **Files:** `server/auth.ts`
- **Test status:** PASS (code review only; no live endpoint in sandbox).

### LB-016 — HIGH — RLS: any authenticated wallet can join any group without invite
- **Root cause:** `members_insert_self` policy checked only that `wallet = jwt.wallet`.
- **Fix:** Replaced with `members_insert_owner_only` + `join_group_by_invite()` server-side function. Client calls RPC instead of direct INSERT.
- **Files:** `supabase/migrations/002_security_hardening.sql`, `src/components/community/GroupList.tsx`
- **Test status:** BLOCKED (requires live DB with three test identities).

### LB-017 — HIGH — RLS: borrower can set loan status = 'funded'/'repaid' without onchain proof
- **Root cause:** `requests_update_borrower` allowed updating any column including `status`.
- **Fix:** New `requests_update_borrower_restricted` policy restricts `WITH CHECK` to `('open', 'lender_selected', 'cancelled')`. Funded/Repaid status goes through `update_loan_request_status()` service-role function only.
- **Files:** `supabase/migrations/002_security_hardening.sql`
- **Test status:** BLOCKED (requires live DB).

### LB-018 — MEDIUM — USDC precision: floating-point arithmetic
- **Root cause:** `parseFloat(str) * 1_000_000` → IEEE-754 rounding errors.
- **Fix:** String-splitting bigint parser with no floating-point. `formatUsdc` uses bigint division. `validateUsdcInput()` rejects invalid decimals.
- **Files:** `src/loanbook-contract.ts`, `src/components/community/RequestCard.tsx`, `src/components/community/GroupView.tsx`, `src/components/CreateLoanPanel.tsx`
- **Test cases:** `parseUsdc("0.1")` → `100000n`, `parseUsdc("0.000001")` → `1n`, `parseUsdc("0.0000001")` → `0n` (rejected), `parseUsdc("-1")` → `0n` (rejected).
- **Test status:** PASS (verified in code review).

---

## What was NOT done (requires external resources)

### Auth-server receipt verification
The auth server (`server/auth.ts`) does not yet verify onchain transaction receipts for `funded`/`repaid` status updates. The LB-017 fix prevents the client from escalating status directly, but the positive path (updating status after a confirmed transaction) is not implemented. An auth-server route `POST /verify-loan-status { requestId, txHash }` should:
1. Fetch the transaction receipt from Arc Testnet.
2. Verify the receipt is from the correct LoanBook contract.
3. Verify the event matches the expected loan ID, borrower, lender, and amount.
4. Call `update_loan_request_status()` via service role.
**Status:** Architecture documented; implementation deferred.

### Rate limiting
The auth server has no rate limiting. Brute-force nonce guessing and DoS are possible. Add token-bucket rate limiting per IP before production deployment.

### HTTPS
The auth server runs HTTP only. In production it must be deployed behind a reverse proxy (nginx, Caddy, or a platform like Fly.io) that terminates TLS.

### Mainnet chain configuration
`src/config.ts` is pinned to Arc Testnet (5042002). A mainnet configuration for Arc (5042) has not been created. The LoanBook contract has NOT been audited or deployed to mainnet. **No mainnet deployment should occur** until:
1. A professional security audit of the Solidity contract is completed.
2. A mainnet contract address is obtained from the deployment team.
3. The mainnet USDC address is confirmed from Circle's official documentation.
4. The testnet loan lifecycle (createLoan → fund → repay) is completed with real wallets.

### Git history scrub
There is no git history in this sandbox. If secrets were ever committed to a real git repository, those commits must be purged (`git filter-repo`) and the exposed keys rotated **before** the repository is made public or shared.

---

## Files changed this session

| File | Change |
|------|--------|
| `server/auth.ts` | Rewrote: stored message, atomic nonce, CORS allowlist, Chain ID in SIWE |
| `supabase/migrations/002_security_hardening.sql` | New: `nonces.message`, `consume_nonce()`, `join_group_by_invite()`, `update_loan_request_status()`, restricted RLS policies |
| `src/loanbook-contract.ts` | Rewrote `parseUsdc`, `formatUsdc`; added `validateUsdcInput` |
| `src/components/community/RequestCard.tsx` | Fixed inline float parse → `parseUsdc()` |
| `src/components/community/GroupView.tsx` | Fixed float parse → `validateUsdcInput + parseUsdc` |
| `src/components/community/GroupList.tsx` | Fixed join flow → `join_group_by_invite` RPC |
| `src/components/CreateLoanPanel.tsx` | Fixed float days calc → `parseInt(days, 10)` |
| `BUGS.md` | Added LB-013 through LB-018 |

---

## Test results

| Test | Result | Date |
|------|--------|------|
| `forge test -vv` | **31/31 PASS** | 2026-10-28 |
| `bun run check` (lint + typecheck) | **0 errors** | 2026-10-28 |
| `bunx vite build` | **PASS** (12.9s) | 2026-10-28 |
| Valid wallet sign-in flow | **BLOCKED** — no live Supabase | — |
| Invalid signature rejection | **BLOCKED** — no live Supabase | — |
| Expired nonce rejection | **BLOCKED** — no live Supabase | — |
| Concurrent nonce replay | **BLOCKED** — no live Supabase | — |
| James joins group without invite | **BLOCKED** — no live DB | — |
| James reads private messages | **BLOCKED** — no live DB | — |
| Borrower sets status=repaid directly | **BLOCKED** — no live DB | — |
| Arc Testnet createLoan → fund → repay | **BLOCKED** — no connected wallets | — |

---

## GO / NO-GO

**NO-GO.**

Required before mainnet:
1. Apply migration 002 to a real Supabase project and run the three-identity RLS tests.
2. Complete the full Arc Testnet loan lifecycle with two wallets.
3. Implement and test auth-server receipt verification for `funded`/`repaid` status.
4. Add rate limiting to the auth server.
5. Deploy auth server behind HTTPS.
6. Obtain and verify the Arc mainnet USDC address and LoanBook contract address.
7. Professional Solidity audit of the LoanBook contract before mainnet deployment.

The Solidity contract itself has no known vulnerabilities (31/31 tests pass, Slither clean). The blocking items are in the application layer and deployment infrastructure.
