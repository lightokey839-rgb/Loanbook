# LoanBook — Test Evidence

**Captured for Arc Microgrants competition submission.**

---

## Session details

| Field | Value |
|---|---|
| **Date** | 2026-10-27 |
| **Time (UTC)** | 08:06:35 |
| **Environment** | Arc Studio sandbox (Foundry 0.2.x, Solc 0.8.28, Cancun EVM) |
| **Executed by** | Arc Studio — commands run live, output captured verbatim |

---

## Task 1 — Solidity unit tests

### Command

```
cd /home/user/app
forge test -vv
```

### Raw output (verbatim, unedited)

```
No files changed, compilation skipped

Ran 31 tests for contracts/test/LoanBook.t.sol:LoanBookTest
[PASS] testFuzz_CreateLoan_ValidInputs(uint256,uint256) (runs: 256, μ: 160452, ~: 160559)
[PASS] test_CancelBeforeFunding() (gas: 185216)
[PASS] test_Constructor_Revert_EOAAddress() (gas: 62652)
[PASS] test_Constructor_Revert_ZeroAddress() (gas: 58642)
[PASS] test_Event_LoanCancelled() (gas: 181828)
[PASS] test_Event_LoanCreated() (gas: 158775)
[PASS] test_Event_LoanFunded() (gas: 251101)
[PASS] test_Event_LoanRepaid() (gas: 261305)
[PASS] test_HappyPath_FullLifecycle() (gas: 268428)
[PASS] test_IsOverdue_AfterRepaid_ReturnsFalse() (gas: 259749)
[PASS] test_IsOverdue_AfterWarp_ReturnsTrue() (gas: 249627)
[PASS] test_IsOverdue_JustFunded_ReturnsFalse() (gas: 249046)
[PASS] test_IsOverdue_OpenLoan_ReturnsFalse() (gas: 156736)
[PASS] test_LoanDates() (gas: 255097)
[PASS] test_Reentrancy_FundLoan() (gas: 1380707)
[PASS] test_RepayAfterDueDate() (gas: 261788)
[PASS] test_Revert_CancelAfterFunded() (gas: 250755)
[PASS] test_Revert_DoubleFund() (gas: 273781)
[PASS] test_Revert_DoubleRepay() (gas: 284004)
[PASS] test_Revert_FundLoan_NoAllowance() (gas: 231270)
[PASS] test_Revert_FundLoan_NoBalance() (gas: 255765)
[PASS] test_Revert_GetLoanNotFound() (gas: 16017)
[PASS] test_Revert_NonBorrowerCancels() (gas: 159552)
[PASS] test_Revert_NonBorrowerRepays() (gas: 280482)
[PASS] test_Revert_NonLenderFunds() (gas: 164615)
[PASS] test_Revert_RepayLoan_NoAllowance() (gas: 256787)
[PASS] test_Revert_RepayLoan_NoBalance() (gas: 304837)
[PASS] test_Revert_SelfLend() (gas: 11382)
[PASS] test_Revert_ZeroAddressLender() (gas: 11143)
[PASS] test_Revert_ZeroAmount() (gas: 13314)
[PASS] test_Revert_ZeroDuration() (gas: 13380)
Suite result: ok. 31 passed; 0 failed; 0 skipped; finished in 11.39ms (13.20ms CPU time)

Ran 1 test suite in 12.38ms (11.39ms CPU time): 31 tests passed, 0 failed, 0 skipped (31 total tests)
```

### Summary

| Metric | Value |
|---|---|
| Test suite | `contracts/test/LoanBook.t.sol:LoanBookTest` |
| Total tests | **31** |
| Passed | **31** |
| Failed | **0** |
| Skipped | **0** |
| Fuzz runs | 256 (for `testFuzz_CreateLoan_ValidInputs`) |
| Compilation | Skipped — no files changed (contract unchanged) |
| Wall time | 12.38 ms |

---

## What the tests prove

### Loan lifecycle
| Test | Proves |
|---|---|
| `test_HappyPath_FullLifecycle` | Full create → fund → repay cycle completes; token balances change by exact principal at each step |
| `test_LoanDates` | `createdAt` set at creation; `fundedAt` and `dueDate = fundedAt + duration` set at funding, not before |
| `test_RepayAfterDueDate` | Repayment is accepted even after the deadline passes |
| `test_IsOverdue_*` (4 tests) | `isOverdue()` returns correct boolean for Open / just-funded / past-due / Repaid states |

### Access control
| Test | Proves |
|---|---|
| `test_Revert_NonLenderFunds` | Only the named lender can call `fundLoan`; any other address reverts |
| `test_Revert_NonBorrowerRepays` | Only the borrower can call `repayLoan`; any other address reverts |
| `test_Revert_NonBorrowerCancels` | Only the borrower can call `cancelLoan`; any other address reverts |
| `test_Revert_SelfLend` | Borrower cannot name themselves as lender |
| `test_Revert_ZeroAddressLender` | Zero address cannot be named as lender |

### USDC funding and repayment
| Test | Proves |
|---|---|
| `test_HappyPath_FullLifecycle` | At `fundLoan`: lender balance decreases by principal, borrower balance increases by principal |
| `test_HappyPath_FullLifecycle` | At `repayLoan`: borrower balance decreases by principal, lender balance increases by principal |
| `test_Revert_FundLoan_NoAllowance` | `fundLoan` reverts if lender has not approved the exact allowance first |
| `test_Revert_FundLoan_NoBalance` | `fundLoan` reverts if lender has insufficient USDC balance |
| `test_Revert_RepayLoan_NoAllowance` | `repayLoan` reverts if borrower has not approved the exact allowance |
| `test_Revert_RepayLoan_NoBalance` | `repayLoan` reverts if borrower has insufficient USDC balance |

### Duplicate prevention
| Test | Proves |
|---|---|
| `test_Revert_DoubleFund` | A funded loan cannot be funded a second time |
| `test_Revert_DoubleRepay` | A repaid loan cannot be repaid a second time |
| `test_Revert_CancelAfterFunded` | A funded loan cannot be cancelled |
| `test_CancelBeforeFunding` | A not-yet-funded loan can be cancelled by the borrower |

### Input validation
| Test | Proves |
|---|---|
| `test_Revert_ZeroAmount` | Amount of 0 is rejected |
| `test_Revert_ZeroDuration` | Duration of 0 is rejected |
| `test_Revert_GetLoanNotFound` | `getLoan` reverts for ID 0 and non-existent IDs |
| `test_Constructor_Revert_ZeroAddress` | Constructor rejects `address(0)` as USDC |
| `test_Constructor_Revert_EOAAddress` | Constructor rejects an address with no deployed bytecode as USDC |

### Reentrancy protection
| Test | Proves |
|---|---|
| `test_Reentrancy_FundLoan` | A malicious ERC-20 that calls back into `fundLoan` during `transferFrom` is blocked by `ReentrancyGuard` |

### Fuzz testing
| Test | Proves |
|---|---|
| `testFuzz_CreateLoan_ValidInputs` | 256 random (amount, duration) combinations all create loans successfully with correct stored values |

---

## Task 2 — Frontend checks

### Command 1: `bun run check`

```
$ bash scripts/check.sh
$ oxlint --type-aware src scripts --fix
Found 0 warnings and 0 errors.
Finished in 1.3s on 27 files with 57 rules using 4 threads.
Found 0 warnings and 0 errors.
Finished in 260ms on 30 files with 34 rules using 4 threads.
$ tsc --noEmit
[exit 0]
```

**Result: PASS — 0 errors, 0 warnings.**

### Command 2: `bunx vite build`

```
✓ built in 14.47s
```

**Result: PASS — production build succeeds with no CSS, TypeScript, or module errors.**

### Tailwind/PostCSS status

LB-001 (the `@import "tailwindcss"` v4 syntax against a v3 installation) was fixed in a previous session. The build above confirms it remains resolved: the PostCSS pipeline processes all CSS without error.

---

## Deployed contract (Arc Testnet)

| Field | Value |
|---|---|
| **Contract name** | LoanBook |
| **Network** | Arc Testnet |
| **Chain ID** | 5042002 |
| **Contract address** | `0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228` |
| **Deploy tx hash** | `0x827075b605b8a29e04c78841506f13610c1226d73b7d830f1f341f3407faf4e7` |
| **Deploy tx status** | `0x1` (success) — verified via `eth_getTransactionReceipt` |
| **USDC constructor arg** | `0x3600000000000000000000000000000000000000` |
| **Bytecode present** | Yes — 3,113 bytes confirmed via `eth_getCode` |
| **Explorer (contract)** | https://explorer.testnet.arc.io/address/0xe1b52752bf5e6cc64a5f65e485ea35ef7cf7a228 |
| **Explorer (deploy tx)** | https://explorer.testnet.arc.io/tx/0x827075b605b8a29e04c78841506f13610c1226d73b7d830f1f341f3407faf4e7 |

---

## Failures and unresolved issues

### None in this session

All 31 tests passed. The build is clean. No test failures or compilation errors.

### Outstanding from previous sessions

| ID | Issue | Status |
|---|---|---|
| LB-009 | USDC approval failure on Arc Testnet lender wallet — root causes fixed in code; production retest with the lender wallet still needed | Investigating |
| Phase 2 lifecycle | Full onchain Alex→Sarah loan cycle (createLoan → approve → fundLoan → approve → repayLoan) blocked on user wallet signatures | Blocked |

---

## Important disclaimers

> **Passing unit tests do not constitute a professional security audit.**
>
> The 31 tests above verify functional correctness of the contract's specified behaviour using mock ERC-20 tokens in a local Foundry EVM environment. They do not replace:
> - A paid, independent smart contract security audit
> - Formal verification
> - Adversarial testing on the live network with real economic incentives
>
> The contract has been reviewed with an automated security tool at max severity, which found no exploitable vulnerabilities, but automated tools have known limitations and cannot detect all classes of vulnerability.
>
> **Do not use this contract with real funds without a professional audit.**

---

## Test file location

`contracts/test/LoanBook.t.sol` — 31 tests, written by Arc Studio contract tester, not modified for this evidence run.

To reproduce: `cd /home/user/app && forge test -vv`
