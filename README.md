# LoanBook

A private community micro-loan tool on Arc Testnet. Members create zero-interest fixed-term USDC loan agreements; lenders fund them with a direct ERC-20 transfer; borrowers repay directly. The contract records every agreement and emits verified events. No principal is ever held in custody.

Built with [Arc Studio](https://studio.arc.io)

> **Bug log:** see `BUGS.md` for all issues encountered and resolved during development.

## What it does

LoanBook is a private social lending platform where Arc users create lending circles, chat, request USDC loans, find lenders, and track repayments onchain. Loan requests are offchain (no gas, no lender address needed). Once a lender is chosen the agreement is recorded on the LoanBook smart contract on Arc Testnet. USDC transfers go directly between wallets — no escrow, no interest.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- **Smart contract:** Solidity 0.8.28, OpenZeppelin 5.6.1, Foundry. Source: `contracts/LoanBook.sol`.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS v4.
- **Wallet:** wagmi v2, viem v2, ConnectKit (injected wallets — MetaMask, Rabby, etc.).
- **Chain:** Arc Testnet (Chain ID 5042002).
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20).

## Deployed contract

| Field | Value |
|---|---|
| Network | Arc Testnet (Chain ID 5042002) |
| Address | `0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228` |
| Deploy tx | `0x827075b605b8a29e04c78841506f13610c1226d73b7d830f1f341f3407faf4e7` |
| Explorer | https://explorer.testnet.arc.io/address/0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228 |

## Development

### Prerequisites

- [Bun](https://bun.sh/) 1.x
- [Foundry](https://getfoundry.sh/) (forge, anvil)
- A browser wallet (MetaMask, Rabby) configured for Arc Testnet

### Install

```bash
bun install
```

### Environment variables

> Copy `.env.example` to `.env` and fill in each value. Phase 4 community features require Supabase — see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon/public key |
| `SUPABASE_URL` | Auth server | Same project URL (server-side) |
| `SUPABASE_SERVICE_KEY` | Auth server | Service role key (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | Auth server | JWT signing secret from Supabase |
| `APP_DOMAIN` | Auth server | Domain binding for SIWE messages (default: `localhost`) |
| `AUTH_PORT` | Auth server | Port to listen on (default: `3001`) |
| `RPC_PROXY_BASE_URL` | Dev server | Provisioned by Arc Studio (optional outside Arc Studio) |
| `RPC_PROXY_TOKEN` | Dev server | Provisioned by Arc Studio (optional outside Arc Studio) |
| `RPC_PROXY_CHAINS` | Dev server | Provisioned by Arc Studio (optional outside Arc Studio) |



### Run

```bash
bun run dev
```

For Phase 4 community features, also start the auth server in a separate terminal:

```bash
bun run server:auth
```

Open `http://localhost:5173`. Connect a wallet and switch to Arc Testnet (Chain ID 5042002, RPC `https://rpc.testnet.arc.io`).

### Contract tests

```bash
bun run contracts:test
# or: forge test -v
```

31 tests, all pass. Covers full lifecycle, balance changes, event emission, access control, reentrancy, and fuzz inputs.

### Contract build

```bash
bun run contracts:build
# or: forge build
```

### Lint + typecheck

```bash
bun run check
```

## Getting testnet USDC

Use **Get test USDC** in the Arc Studio sidebar, or add Arc Testnet to your wallet and connect. Gas on Arc is paid in USDC (no separate ETH needed). Each wallet needs at least 6 USDC for a 5 USDC test loan.

## Loan flow

1. **Alex (borrower)** connects wallet, enters Sarah's address, amount (e.g. 0.01 USDC), and duration (e.g. 7 days), clicks **Create Loan Request**. Approves wallet signature. Gets Loan ID.
2. **Sarah (lender)** switches to her wallet, goes to **Fund / Repay**, enters the loan ID, clicks **Load**. Clicks **Approve X USDC** (approves allowance). Then clicks **Fund Loan**. USDC transfers directly to Alex.
3. **Alex** switches back, enters the loan ID, sees Funded status, clicks **Approve X USDC** then **Repay**. USDC transfers directly back to Sarah.

Each step shows a tx hash with a live Arc Explorer link.

## Known limitations

- No onchain membership enforcement — any address can call `createLoan`. Private-group membership is offchain (Phase 4).
- Loan terms are publicly readable onchain. "Private" applies to the social layer only.
- No repayment enforcement — overdue loans display a badge but the contract takes no action.
- This is testnet software. Not audited for mainnet use. See Phase 1 security review notes in AGENTS.md.
