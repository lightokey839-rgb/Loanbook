# LoanBook

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

LoanBook is a private community P2P USDC micro-loan registry on Arc Testnet. Members connect wallets, create private circles, discuss small fixed-term zero-interest USDC loans, and fund/repay those loans onchain. The contract coordinates direct lender→borrower and borrower→lender USDC transfers via ERC-20 allowances; it never custodies funds.

## Deployed Contracts

### LoanBook
- **Network:** Arc Testnet (Chain ID: 5042002)
- **Address:** `0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228`
- **Tx Hash:** `0x827075b605b8a29e04c78841506f13610c1226d73b7d830f1f341f3407faf4e7`
- **Explorer:** https://explorer.testnet.arc.io/address/0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228
- **Deployed at:** 2026-10-26T14:26:32.432Z
- **USDC (constructor arg):** `0x3600000000000000000000000000000000000000`
- **Artifact:** `contracts/out/LoanBook.sol/LoanBook.json`
- **Metadata:** `contracts/contract-metadata/LoanBook.json`

## Build Status

- Phase 1 complete: contract written, security-reviewed, Slither-analyzed, 31/31 unit tests passing, deployed.
- Phase 2 frontend complete: wallet-connected interface with create/fund/repay/cancel flows, network guard, USDC balance display, tx state feedback, Arc Explorer links. Lint + typecheck pass clean.
- Phase 2 testnet lifecycle: BLOCKED pending wallet signatures from user.

## Frontend Files (Phase 2)

- `src/App.tsx` — main app, landing/tab layout
- `src/loanbook-contract.ts` — ABI, address, types, helpers
- `src/onchain-error.ts` — user-friendly error messages
- `src/components/WalletBar.tsx` — ConnectKit button + USDC balance
- `src/components/NetworkGuard.tsx` — enforces Arc Testnet, prompts switch
- `src/components/CreateLoanPanel.tsx` — borrower creates a loan
- `src/components/ApproveAndFundPanel.tsx` — lender 2-step approve+fund
- `src/components/ApproveAndRepayPanel.tsx` — borrower 2-step approve+repay
- `src/components/LookupPanel.tsx` — load any loan by ID, shows correct action panel
- `src/components/LoanCard.tsx` — live loan detail card
- `src/components/LoanStatusBadge.tsx` — status pill (Open/Funded/Repaid/Cancelled/Overdue)
- `src/components/TxButton.tsx` — button with signing/confirming/success states
- `src/components/TxReceipt.tsx` — tx hash + Arc Explorer link

## Design Decisions

- Contract is immutable — no owner, no admin, no upgradability.
- Private community membership is enforced at the offchain/chat layer (Supabase), not onchain.
- Loan terms and counterparties are publicly readable onchain (inherent to EVM transparency). "Private" refers to the social/chat layer only.
- Overdue status is derived (Funded + block.timestamp > dueDate), never stored.
- Loan IDs start at 1 (loanCount pre-incremented).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
