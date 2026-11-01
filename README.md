# LoanBook

Private lending circles with persistent chat and zero-interest, unsecured USDC loans on Arc. LoanBook coordinates direct transfers; it does not pool or custody loan principal.

Originally built in [Arc Studio](https://studio.arc.io/app/02e165d9-bda4-4b41-ab19-757f5511337e). Existing repository: https://github.com/lightokey839-rgb/Loanbook. Builder: https://x.com/LIGHTDESIGN2022.

## Current release status — 1 November 2026

The review branch is configured for the deployed Arc Mainnet contract. The public frontend deployment remains subject to the GitHub Pages workflow and Supabase public build secrets. The contract is immutable and has not been independently audited.

## Mainnet deployment

- **Network:** Arc Mainnet (Chain ID: 5042)
- **LoanBook:** `0x08435c5d74a00591c4eaa25ad433eeccb5c0980e`
- **Deployment transaction:** `0x4fd3f4efd814d48fca5d33508ec2b51163dd174aaeb670e62f50d8c1cadb15e1`
- **Explorer:** https://explorer.arc.io/address/0x08435c5d74a00591c4eaa25ad433eeccb5c0980e
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals)

## Local use

Use Node 24 and npm. Run npm ci, copy .env.example to a local .env with public browser configuration, then npm run dev. For production preview: npm run build followed by npm run preview. npm is the canonical lockfile for this release; the original bun.lock is historical.

Checks: npm run check; npm test; npm run test:db; npm run test:contracts. Contract compilation uses Solidity 0.8.28. Windows environments that cannot resolve Foundry's compiler home can pass --use with a verified local solc executable.

## Main flows

Connect wallet → sign the SIWE login message → create/join a circle → chat → request USDC → offer to lend → borrower selects a lender → create onchain agreement → lender approves and funds → borrower approves and repays. Direct Loans remains separate and does not depend on Supabase.

RLS protects private conversations. Onchain terms, amounts and wallet addresses are public. Loans are unsecured; repayment cannot be forced. Use only trusted counterparties.

Read DEPLOYMENT.md, TEST_RESULTS.md and SECURITY_REVIEW.md before release. Loans are unsecured, there is no onchain enforcement of repayment, and the contract has not received an independent third-party audit.

## How this was built

LoanBook was generated and iterated in Arc Studio, then reviewed in the existing GitHub repository. **TODO:** confirm the exact Arc Studio prompts and generated-versus-manual changes. **TODO:** add the final hosting workflow URL and release commit after GitHub Actions succeeds. **TODO:** record the exact test wallets and transaction links used for any public demonstration.
