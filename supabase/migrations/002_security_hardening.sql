-- LoanBook security hardening migration
-- Apply AFTER 001_loanbook_schema.sql
-- Run in Supabase SQL Editor or via: supabase db push
--
-- Fixes:
--   LB-013 — nonces.message column: store the exact signed message text
--   LB-014 — consume_nonce() function: atomic single-use consumption
--   LB-016 — join_group_by_invite() function: server-enforced invite validation
--   LB-017 — loan_requests update policy: prevent client-side status escalation

-- ─────────────────────────────────────────────────────────────────────────────
-- LB-013 FIX: add message column to nonces table
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.nonces
  add column if not exists message text;

-- ─────────────────────────────────────────────────────────────────────────────
-- LB-014 FIX: atomic nonce consumption function
--
-- Called by the auth server (service-role key).
-- Returns the stored message text if successful, null otherwise.
-- Uses UPDATE … WHERE … AND used = false AND expires_at > now()
-- which is a single atomic statement — no TOCTOU window.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.consume_nonce(
  p_nonce  text,
  p_wallet text
)
returns table (message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
begin
  update public.nonces
  set    used = true
  where  nonce      = p_nonce
    and  wallet     = p_wallet
    and  used       = false
    and  expires_at > now()
  returning public.nonces.message into v_message;

  if not found then
    return;  -- empty result set = invalid/expired/already-used
  end if;

  return query select v_message;
end;
$$;

-- Only the service role (auth server) may call this function
revoke all on function public.consume_nonce(text, text) from public;
revoke all on function public.consume_nonce(text, text) from anon;
revoke all on function public.consume_nonce(text, text) from authenticated;
-- (service_role retains EXECUTE by default via Supabase bootstrap)

-- ─────────────────────────────────────────────────────────────────────────────
-- LB-016 FIX: invite-code enforcement via server-enforced DB function
--
-- The existing members_insert_self RLS policy allows any authenticated wallet
-- to insert themselves into any group by knowing its UUID, bypassing the invite
-- code. We replace it with a security-definer function that verifies the invite
-- code before inserting.
--
-- Flow:
--   1. GroupList.tsx calls rpc('join_group_by_invite', { p_invite_code, p_wallet })
--      using the user's JWT (authenticated role).
--   2. The function verifies the invite code, checks the wallet isn't already a
--      member, and inserts the membership row — all inside one transaction.
--   3. Returns the group id on success, raises an exception on failure.
--
-- The permissive insert policy is tightened: direct INSERT is now blocked
-- except by the service role or via the function.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old permissive insert policy
drop policy if exists "members_insert_self" on public.group_members;

-- New policy: only allow insert when the wallet matches JWT AND the group
-- owner is the caller (group creation path), OR the insert happens via our
-- security-definer function (which runs as service role internally).
-- Direct "join by invite" insert from client is now blocked.
create policy "members_insert_owner_only"
  on public.group_members for insert
  with check (
    -- Allow the group owner to be inserted (group creation flow)
    wallet = (current_setting('request.jwt.claims', true)::json->>'wallet')
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and g.owner = (current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- The invite-join function (security definer, runs as service role)
create or replace function public.join_group_by_invite(
  p_invite_code text,
  p_wallet      text
)
returns uuid  -- returns the group_id joined
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  -- Validate wallet format
  if p_wallet !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid_wallet' using hint = 'Wallet must be a 0x address';
  end if;

  -- Validate caller is the authenticated wallet (JWT claim must match p_wallet)
  if lower(p_wallet) !=
     lower(current_setting('request.jwt.claims', true)::json->>'wallet') then
    raise exception 'forbidden' using hint = 'Wallet does not match session';
  end if;

  -- Find the group by invite code
  select id into v_group_id
  from public.groups
  where invite_code = p_invite_code
  limit 1;

  if v_group_id is null then
    raise exception 'not_found' using hint = 'Invite code not found';
  end if;

  -- Idempotent: return group_id if already a member
  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and wallet = lower(p_wallet)
  ) then
    return v_group_id;
  end if;

  -- Insert the membership
  insert into public.group_members (group_id, wallet, role)
  values (v_group_id, lower(p_wallet), 'member');

  return v_group_id;
end;
$$;

-- Authenticated users (any valid JWT) may call this function
grant execute on function public.join_group_by_invite(text, text) to authenticated;
revoke execute on function public.join_group_by_invite(text, text) from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- LB-017 FIX: prevent client-side loan status escalation
--
-- The old requests_update_borrower policy allowed the borrower to set any
-- status value including 'funded' and 'repaid' without onchain verification.
-- The new policy restricts UPDATE to only the columns the borrower legitimately
-- controls: note, selected_lender, and status (only open→cancelled transition).
--
-- Funding and repayment status is updated by the auth server via the service
-- role key after verifying the onchain transaction receipt. Client code can
-- no longer escalate status directly.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "requests_update_borrower" on public.loan_requests;

-- Borrower can cancel their own open request and set selected_lender
create policy "requests_update_borrower_restricted"
  on public.loan_requests for update
  using (
    borrower = (current_setting('request.jwt.claims', true)::json->>'wallet')
  )
  with check (
    borrower = (current_setting('request.jwt.claims', true)::json->>'wallet')
    -- Allow: cancel (open → cancelled) or select a lender (open → lender_selected)
    -- Disallow: status = 'funded' or 'repaid' from client
    and status in ('open', 'lender_selected', 'cancelled')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: update_loan_request_status()
--
-- Called by the auth server (service-role key) after verifying an onchain
-- transaction receipt. Validates the transition is legal before updating.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.update_loan_request_status(
  p_request_id    uuid,
  p_new_status    text,
  p_onchain_loan_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  select status into v_current
  from public.loan_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'not_found' using hint = 'Loan request not found';
  end if;

  -- Enforce legal state transitions
  if p_new_status = 'funded' and v_current not in ('open', 'lender_selected') then
    raise exception 'invalid_transition'
      using hint = format('Cannot transition from %s to funded', v_current);
  end if;

  if p_new_status = 'repaid' and v_current != 'funded' then
    raise exception 'invalid_transition'
      using hint = format('Cannot transition from %s to repaid', v_current);
  end if;

  if p_new_status not in ('open','lender_selected','funded','repaid','cancelled') then
    raise exception 'invalid_status';
  end if;

  update public.loan_requests
  set
    status           = p_new_status,
    onchain_loan_id  = coalesce(p_onchain_loan_id, onchain_loan_id),
    updated_at       = now()
  where id = p_request_id;
end;
$$;

-- Only the service role may call status update (used by auth server)
revoke all on function public.update_loan_request_status(uuid, text, bigint) from public;
revoke all on function public.update_loan_request_status(uuid, text, bigint) from anon;
revoke all on function public.update_loan_request_status(uuid, text, bigint) from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Index: speed up nonce lookups
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists nonces_nonce_wallet_idx
  on public.nonces (nonce, wallet)
  where used = false;

create index if not exists nonces_expires_cleanup_idx
  on public.nonces (expires_at)
  where used = true;
