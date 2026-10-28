# Supabase Setup Guide for LoanBook Phase 4

This guide covers setting up Supabase, configuring the auth server, and running the
community features locally and in production.

---

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a free account.
2. Create a new project. Choose a region close to your users.
3. Wait for the project to finish provisioning (~2 minutes).

---

## 2. Run the database migrations

LoanBook ships with a single migration file at `supabase/migrations/001_loanbook_schema.sql`.
Apply it to your project one of two ways:

### Option A — Supabase SQL Editor (easiest)

1. Open your project in the Supabase dashboard.
2. Go to **SQL Editor** → **New query**.
3. Paste the entire contents of `supabase/migrations/001_loanbook_schema.sql`.
4. Click **Run**.

### Option B — Supabase CLI

```bash
# Install (once)
npm install -g supabase

# Link to your project (run from the repo root)
supabase login
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push
```

---

## 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API → service_role (secret!) |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Settings → API → JWT Settings → JWT Secret |
| `APP_DOMAIN` | `localhost` for local dev; your deployed domain in production |
| `AUTH_PORT` | `3001` (default; change if needed) |

> **Security**: `SUPABASE_SERVICE_KEY` and `SUPABASE_JWT_SECRET` bypass Row-Level Security.
> Never use a `VITE_` prefix for them. Never commit `.env`.

---

## 4. Start the auth server

The auth server handles wallet-signature auth, nonce generation, and JWT issuance.
It runs alongside the Vite dev server.

```bash
# Terminal 1 — Vite dev server
bun run dev

# Terminal 2 — Auth server
bun run server:auth
```

The auth server starts on port 3001 (or `AUTH_PORT`). The Vite dev server proxies
`/api/auth/*` → `http://localhost:3001/*`, so the frontend never needs to know the
auth server's port.

---

## 5. Verify the setup

1. Open the app in your browser (http://localhost:5173).
2. Connect your wallet.
3. Click the **Community** tab.
4. Click **Sign in with wallet** — you should see a signature request in your wallet.
5. After signing, you'll be authenticated and can create or join groups.

---

## Auth flow (how it works)

```
Browser                         Auth server (port 3001)          Supabase
  |                                    |                              |
  |  GET /api/auth/nonce               |                              |
  |  (wallet address as query param)   |                              |
  |──────────────────────────────────►|                              |
  |  { nonce, message }                |  upsert profile (nonce)     |
  |◄──────────────────────────────────|────────────────────────────►|
  |                                    |                              |
  |  (user signs message in wallet)    |                              |
  |                                    |                              |
  |  POST /api/auth/verify             |                              |
  |  { wallet, signature }             |                              |
  |──────────────────────────────────►|                              |
  |                                    |  verify nonce + sig          |
  |                                    |  issue JWT (HS256)           |
  |  { token }                         |────────────────────────────►|
  |◄──────────────────────────────────|                              |
  |                                    |                              |
  |  all Supabase calls include token  |                              |
  |  in Authorization: Bearer header   |                              |
  |──────────────────────────────────────────────────────────────►|
```

The JWT is a standard `HS256` token. The `sub` claim is the user's wallet address
(checksummed). Supabase uses it to enforce Row-Level Security policies.

---

## 6. Row-Level Security

All RLS policies are defined in the migration SQL. Key rules:

| Table | Read | Write |
|---|---|---|
| `profiles` | Public (wallet + display name) | Own row only |
| `groups` | Members only | Owner only |
| `group_members` | Group members only | Owner can insert/delete; own row only otherwise |
| `messages` | Group members only | Own wallet only |
| `loan_requests` | Group members only | Own wallet only |
| `loan_interests` | Group members only | Own wallet only |

The JWT `sub` claim (`auth.jwt() ->> 'sub'`) is the wallet address. Every policy
compares against it, so there is no separate user ID to track.

---

## 7. Realtime

Supabase Realtime is used for:
- **Chat messages** — new messages appear instantly in ChatPane
- **Loan requests** — new requests appear in GroupView without refresh
- **Interest expressions** — interest counts update live in RequestCard

Realtime requires the tables to have `REPLICA IDENTITY FULL` set (included in the
migration) and for the Supabase project to have Realtime enabled (it is by default).

---

## 8. Deploying to production

1. Set all environment variables on your hosting platform (Netlify, Vercel, etc.).
2. The `SUPABASE_SERVICE_KEY` and `SUPABASE_JWT_SECRET` go into the server environment
   only (never in a `VITE_` variable).
3. Change `APP_DOMAIN` to your production domain (used in SIWE message binding).
4. Start the auth server alongside your frontend (e.g. as a separate Node/Bun process,
   a Render service, a Railway app, or a Docker container).
5. Update `CORS_ORIGIN` logic in `server/auth.ts` if your frontend is on a different
   origin than the server.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Nonce not found` on verify | The nonce expired (5-minute TTL) or the wallet address changed between nonce fetch and verify. |
| `JWT Secret is missing` on server start | `SUPABASE_JWT_SECRET` is not set in `.env`. |
| RLS errors (403 from Supabase) | The JWT `sub` does not match the wallet doing the write. Check the token in the browser's sessionStorage. |
| Realtime messages not appearing | Check the Supabase dashboard → Realtime → Enabled tables; ensure your tables are listed. |
| Auth server not reachable from browser | Vite proxy is not running — ensure `bun run dev` is running (not just `bun run server:auth`). |
