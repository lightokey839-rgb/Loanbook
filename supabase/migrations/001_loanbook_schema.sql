-- LoanBook Phase 4 — Supabase schema
-- Run in your Supabase project: SQL Editor → New query → paste → Run
-- Or use the Supabase CLI: supabase db push

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per wallet address. Created on first login.
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  wallet      text not null unique,          -- lowercase 0x address
  display_name text,                         -- optional username
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Anyone can read profiles (wallet → display_name lookup in chat)
create policy "profiles_select_all"
  on public.profiles for select using (true);

-- Only the owner can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (wallet = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- Insert allowed for authenticated users (their own wallet only)
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (wallet = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- ── groups ───────────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner       text not null,               -- lowercase wallet address of creator
  invite_code text not null unique default encode(gen_random_bytes(12), 'base64'),
  created_at  timestamptz not null default now()
);
alter table public.groups enable row level security;

-- Only members may see a group
create policy "groups_select_member"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Only authenticated users can create groups
create policy "groups_insert_auth"
  on public.groups for insert
  with check (owner = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- Only owner can update group metadata
create policy "groups_update_owner"
  on public.groups for update
  using (owner = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- ── group_members ─────────────────────────────────────────────────────────────
create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  wallet      text not null,               -- lowercase wallet address
  role        text not null default 'member' check (role in ('owner','member')),
  joined_at   timestamptz not null default now(),
  unique(group_id, wallet)
);
alter table public.group_members enable row level security;

-- Members can see other members in their groups
create policy "members_select_member"
  on public.group_members for select
  using (
    wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    or exists (
      select 1 from public.group_members m2
      where m2.group_id = group_id
        and m2.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Users can insert themselves as members (when joining via invite)
create policy "members_insert_self"
  on public.group_members for insert
  with check (wallet = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- Members can leave (delete their own row); owners cannot be removed this way
create policy "members_delete_self"
  on public.group_members for delete
  using (wallet = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- ── messages ─────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  sender      text not null,               -- lowercase wallet address
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
alter table public.messages enable row level security;

-- Only group members may read messages
create policy "messages_select_member"
  on public.messages for select
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = messages.group_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Only group members may post messages
create policy "messages_insert_member"
  on public.messages for insert
  with check (
    sender = (current_setting('request.jwt.claims', true)::json->>'wallet')
    and exists (
      select 1 from public.group_members m
      where m.group_id = messages.group_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- ── loan_requests ─────────────────────────────────────────────────────────────
-- Offchain loan request posted to a group. No lender address yet.
create table if not exists public.loan_requests (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  borrower      text not null,             -- lowercase wallet address
  amount_usdc   numeric(18,6) not null check (amount_usdc > 0),
  duration_days integer not null check (duration_days > 0),
  note          text default '',
  status        text not null default 'open'
                  check (status in ('open','lender_selected','funded','repaid','cancelled')),
  selected_lender text,                    -- set when borrower chooses a lender
  onchain_loan_id bigint,                  -- set when createLoan tx confirms
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.loan_requests enable row level security;

-- Only group members may see loan requests
create policy "requests_select_member"
  on public.loan_requests for select
  using (
    exists (
      select 1 from public.group_members m
      where m.group_id = loan_requests.group_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Only borrower (who must be a group member) may create a request
create policy "requests_insert_member"
  on public.loan_requests for insert
  with check (
    borrower = (current_setting('request.jwt.claims', true)::json->>'wallet')
    and exists (
      select 1 from public.group_members m
      where m.group_id = loan_requests.group_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Only borrower may update their own request (select lender, update status)
create policy "requests_update_borrower"
  on public.loan_requests for update
  using (borrower = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- ── loan_interests ────────────────────────────────────────────────────────────
-- A group member expresses interest in lending.
create table if not exists public.loan_interests (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.loan_requests(id) on delete cascade,
  lender      text not null,              -- lowercase wallet address
  created_at  timestamptz not null default now(),
  unique(request_id, lender)
);
alter table public.loan_interests enable row level security;

-- Group members of the parent request's group may see interests
create policy "interests_select_member"
  on public.loan_interests for select
  using (
    exists (
      select 1 from public.loan_requests r
      join public.group_members m on m.group_id = r.group_id
      where r.id = loan_interests.request_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Lender may insert their own interest (must be a group member)
create policy "interests_insert_member"
  on public.loan_interests for insert
  with check (
    lender = (current_setting('request.jwt.claims', true)::json->>'wallet')
    and exists (
      select 1 from public.loan_requests r
      join public.group_members m on m.group_id = r.group_id
      where r.id = loan_interests.request_id
        and m.wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- Lender may withdraw their own interest
create policy "interests_delete_own"
  on public.loan_interests for delete
  using (lender = (current_setting('request.jwt.claims', true)::json->>'wallet'));

-- ── nonces ────────────────────────────────────────────────────────────────────
-- Short-lived nonces for wallet-signature auth. Managed by the auth server.
create table if not exists public.nonces (
  id          uuid primary key default gen_random_uuid(),
  wallet      text not null,
  nonce       text not null unique,
  expires_at  timestamptz not null,
  used        boolean not null default false
);
-- Nonces are managed by server-side service key only, no user RLS needed
alter table public.nonces enable row level security;
-- No user-facing policies — only the service role key accesses this table.

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime for messages and loan_requests tables
-- (Run in Supabase Dashboard > Database > Replication if not set via CLI)
-- alter publication supabase_realtime add table public.messages;
-- alter publication supabase_realtime add table public.loan_requests;
-- alter publication supabase_realtime add table public.loan_interests;
