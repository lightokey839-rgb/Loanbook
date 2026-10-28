// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LoanBook} from "../LoanBook.sol";

// ---------------------------------------------------------------------------
// Minimal MockERC20 — standard ERC-20 with mint, approve, transfer, transferFrom
// ---------------------------------------------------------------------------
contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// MaliciousERC20 — re-enters fundLoan inside transferFrom (reentrancy test)
// ---------------------------------------------------------------------------
contract MaliciousERC20 {
    LoanBook public book;
    uint256 public attackLoanId;
    bool    public attacking;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals = 6;

    function setTarget(address _book, uint256 _loanId) external {
        book = LoanBook(_book);
        attackLoanId = _loanId;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    // transferFrom re-enters fundLoan on first call
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "bad balance");
        require(allowance[from][msg.sender] >= amount, "bad allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        if (!attacking) {
            attacking = true;
            book.fundLoan(attackLoanId); // re-enter — should revert
        }
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract LoanBookTest is Test {
    LoanBook    internal book;
    MockERC20   internal usdc;

    address internal alice   = makeAddr("alice");   // borrower
    address internal bob     = makeAddr("bob");     // lender
    address internal carol   = makeAddr("carol");   // third party

    uint256 internal constant AMOUNT   = 100e6;  // 100 USDC
    uint256 internal constant DURATION = 30 days;

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        book = new LoanBook(address(usdc));

        // seed balances
        usdc.mint(bob,   1_000e6);
        usdc.mint(alice, 1_000e6);
    }

    // -----------------------------------------------------------------------
    // 1. Happy-path: createLoan → fundLoan → repayLoan (balance changes)
    // -----------------------------------------------------------------------
    function test_HappyPath_FullLifecycle() public {
        // create
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);
        assertEq(loanId, 1);

        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 aliceBefore = usdc.balanceOf(alice);

        // fund: bob approves and funds
        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        // bob lost AMOUNT, alice gained AMOUNT
        assertEq(usdc.balanceOf(bob),   bobBefore   - AMOUNT);
        assertEq(usdc.balanceOf(alice), aliceBefore + AMOUNT);

        // repay: alice approves and repays
        vm.prank(alice);
        usdc.approve(address(book), AMOUNT);
        vm.prank(alice);
        book.repayLoan(loanId);

        // alice lost AMOUNT back, bob regained AMOUNT
        assertEq(usdc.balanceOf(alice), aliceBefore);
        assertEq(usdc.balanceOf(bob),   bobBefore);

        LoanBook.Loan memory loan = book.getLoan(loanId);
        assertEq(uint(loan.state), uint(LoanBook.LoanState.Repaid));
    }

    // -----------------------------------------------------------------------
    // 2. Loan dates: createdAt, fundedAt, dueDate
    // -----------------------------------------------------------------------
    function test_LoanDates() public {
        uint256 t0 = block.timestamp;

        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        LoanBook.Loan memory loan = book.getLoan(loanId);
        assertEq(loan.createdAt, t0);
        assertEq(loan.fundedAt, 0);
        assertEq(loan.dueDate, 0);

        vm.warp(t0 + 1 hours);
        uint256 tFund = block.timestamp;

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        loan = book.getLoan(loanId);
        assertEq(loan.fundedAt, tFund);
        assertEq(loan.dueDate,  tFund + DURATION);
    }

    // -----------------------------------------------------------------------
    // 3. Repayment allowed after due date (vm.warp past dueDate)
    // -----------------------------------------------------------------------
    function test_RepayAfterDueDate() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        // warp past due date
        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(alice);
        usdc.approve(address(book), AMOUNT);
        vm.prank(alice);
        book.repayLoan(loanId); // should NOT revert

        LoanBook.Loan memory loan = book.getLoan(loanId);
        assertEq(uint(loan.state), uint(LoanBook.LoanState.Repaid));
    }

    // -----------------------------------------------------------------------
    // 4. Invalid inputs on createLoan
    // -----------------------------------------------------------------------
    function test_Revert_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(LoanBook.LoanBook__ZeroAmount.selector);
        book.createLoan(bob, 0, DURATION);
    }

    function test_Revert_ZeroDuration() public {
        vm.prank(alice);
        vm.expectRevert(LoanBook.LoanBook__ZeroDuration.selector);
        book.createLoan(bob, AMOUNT, 0);
    }

    function test_Revert_ZeroAddressLender() public {
        vm.prank(alice);
        vm.expectRevert(LoanBook.LoanBook__InvalidLender.selector);
        book.createLoan(address(0), AMOUNT, DURATION);
    }

    function test_Revert_SelfLend() public {
        vm.prank(alice);
        vm.expectRevert(LoanBook.LoanBook__SelfLend.selector);
        book.createLoan(alice, AMOUNT, DURATION);
    }

    // -----------------------------------------------------------------------
    // 5. Wrong caller reverts
    // -----------------------------------------------------------------------
    function test_Revert_NonLenderFunds() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(carol);
        vm.expectRevert(LoanBook.LoanBook__NotLender.selector);
        book.fundLoan(loanId);
    }

    function test_Revert_NonBorrowerRepays() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.prank(carol);
        usdc.approve(address(book), AMOUNT);
        vm.prank(carol);
        vm.expectRevert(LoanBook.LoanBook__NotBorrower.selector);
        book.repayLoan(loanId);
    }

    function test_Revert_NonBorrowerCancels() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(carol);
        vm.expectRevert(LoanBook.LoanBook__NotBorrower.selector);
        book.cancelLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 6. Insufficient allowance
    // -----------------------------------------------------------------------
    function test_Revert_FundLoan_NoAllowance() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        // bob has balance but zero allowance
        vm.prank(bob);
        vm.expectRevert(); // SafeERC20 wraps the ERC-20 revert
        book.fundLoan(loanId);
    }

    function test_Revert_RepayLoan_NoAllowance() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        // alice has balance but zero allowance for repayment
        vm.prank(alice);
        vm.expectRevert();
        book.repayLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 7. Insufficient balance
    // -----------------------------------------------------------------------
    function test_Revert_FundLoan_NoBalance() public {
        // create a fresh lender with no balance
        address poorLender = makeAddr("poorLender");
        vm.prank(alice);
        uint256 loanId = book.createLoan(poorLender, AMOUNT, DURATION);

        // poorLender approves but has 0 balance
        vm.prank(poorLender);
        usdc.approve(address(book), AMOUNT);
        vm.prank(poorLender);
        vm.expectRevert();
        book.fundLoan(loanId);
    }

    function test_Revert_RepayLoan_NoBalance() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        // alice has received AMOUNT but now sends it away to zero out balance
        // Compute balance first (view call) then prank the state-changing transfer
        uint256 aliceBal = usdc.balanceOf(alice);
        vm.prank(alice);
        usdc.transfer(carol, aliceBal);

        vm.prank(alice);
        usdc.approve(address(book), AMOUNT);
        vm.prank(alice);
        vm.expectRevert();
        book.repayLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 8. Double funding reverts
    // -----------------------------------------------------------------------
    function test_Revert_DoubleFund() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT * 2);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                LoanBook.LoanBook__InvalidState.selector,
                loanId,
                LoanBook.LoanState.Funded,
                LoanBook.LoanState.Open
            )
        );
        book.fundLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 9. Double repayment reverts
    // -----------------------------------------------------------------------
    function test_Revert_DoubleRepay() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.prank(alice);
        usdc.approve(address(book), AMOUNT * 2);
        vm.prank(alice);
        book.repayLoan(loanId);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                LoanBook.LoanBook__InvalidState.selector,
                loanId,
                LoanBook.LoanState.Repaid,
                LoanBook.LoanState.Funded
            )
        );
        book.repayLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 10. Cancel before funding: works, emits LoanCancelled
    // -----------------------------------------------------------------------
    function test_CancelBeforeFunding() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(book));
        emit LoanBook.LoanCancelled(loanId, alice, block.timestamp);
        book.cancelLoan(loanId);

        LoanBook.Loan memory loan = book.getLoan(loanId);
        assertEq(uint(loan.state), uint(LoanBook.LoanState.Cancelled));
    }

    // -----------------------------------------------------------------------
    // 11. Cancel after funding reverts with InvalidState
    // -----------------------------------------------------------------------
    function test_Revert_CancelAfterFunded() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                LoanBook.LoanBook__InvalidState.selector,
                loanId,
                LoanBook.LoanState.Funded,
                LoanBook.LoanState.Open
            )
        );
        book.cancelLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 12. getLoan on nonexistent id reverts LoanBook__LoanNotFound
    // -----------------------------------------------------------------------
    function test_Revert_GetLoanNotFound() public {
        vm.expectRevert(
            abi.encodeWithSelector(LoanBook.LoanBook__LoanNotFound.selector, 0)
        );
        book.getLoan(0);

        vm.expectRevert(
            abi.encodeWithSelector(LoanBook.LoanBook__LoanNotFound.selector, 999)
        );
        book.getLoan(999);
    }

    // -----------------------------------------------------------------------
    // 13. isOverdue edge cases
    // -----------------------------------------------------------------------
    function test_IsOverdue_OpenLoan_ReturnsFalse() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);
        assertFalse(book.isOverdue(loanId));
    }

    function test_IsOverdue_JustFunded_ReturnsFalse() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        assertFalse(book.isOverdue(loanId));
    }

    function test_IsOverdue_AfterWarp_ReturnsTrue() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.warp(block.timestamp + DURATION + 1);
        assertTrue(book.isOverdue(loanId));
    }

    function test_IsOverdue_AfterRepaid_ReturnsFalse() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(alice);
        usdc.approve(address(book), AMOUNT);
        vm.prank(alice);
        book.repayLoan(loanId);

        assertFalse(book.isOverdue(loanId));
    }

    // -----------------------------------------------------------------------
    // 14. Event emission
    // -----------------------------------------------------------------------
    function test_Event_LoanCreated() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(book));
        emit LoanBook.LoanCreated(1, alice, bob, AMOUNT, DURATION);
        book.createLoan(bob, AMOUNT, DURATION);
    }

    function test_Event_LoanFunded() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);
        uint256 expectedDueDate = block.timestamp + DURATION;

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(book));
        emit LoanBook.LoanFunded(loanId, bob, alice, AMOUNT, expectedDueDate);
        book.fundLoan(loanId);
    }

    function test_Event_LoanRepaid() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        vm.prank(bob);
        usdc.approve(address(book), AMOUNT);
        vm.prank(bob);
        book.fundLoan(loanId);

        uint256 repaidAt = block.timestamp;
        vm.prank(alice);
        usdc.approve(address(book), AMOUNT);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(book));
        emit LoanBook.LoanRepaid(loanId, alice, bob, AMOUNT, repaidAt);
        book.repayLoan(loanId);
    }

    function test_Event_LoanCancelled() public {
        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, AMOUNT, DURATION);

        uint256 cancelledAt = block.timestamp;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(book));
        emit LoanBook.LoanCancelled(loanId, alice, cancelledAt);
        book.cancelLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // 15. Constructor reverts
    // -----------------------------------------------------------------------
    function test_Constructor_Revert_ZeroAddress() public {
        vm.expectRevert(LoanBook.LoanBook__InvalidUSDC.selector);
        new LoanBook(address(0));
    }

    function test_Constructor_Revert_EOAAddress() public {
        // EOA has no code → should revert
        address eoa = makeAddr("eoa");
        vm.expectRevert(LoanBook.LoanBook__InvalidUSDC.selector);
        new LoanBook(eoa);
    }

    // -----------------------------------------------------------------------
    // 16. Reentrancy guard on fundLoan
    // -----------------------------------------------------------------------
    function test_Reentrancy_FundLoan() public {
        MaliciousERC20 evil = new MaliciousERC20();

        // Deploy a book that uses the malicious token
        LoanBook evilBook = new LoanBook(address(evil));

        // alice creates a loan with bob as lender
        vm.prank(alice);
        uint256 loanId = evilBook.createLoan(bob, AMOUNT, DURATION);

        // wire the attacker: the malicious token re-enters fundLoan(loanId)
        evil.setTarget(address(evilBook), loanId);

        // give bob enough fake balance and allowance
        evil.mint(bob, AMOUNT * 2);
        vm.prank(bob);
        evil.approve(address(evilBook), AMOUNT * 2);

        // The reentrancy guard should cause the re-entrant call to revert,
        // which bubbles up and causes the outer call to revert as well.
        vm.prank(bob);
        vm.expectRevert();
        evilBook.fundLoan(loanId);
    }

    // -----------------------------------------------------------------------
    // Fuzz: createLoan with valid non-zero amount and duration always succeeds
    // -----------------------------------------------------------------------
    function testFuzz_CreateLoan_ValidInputs(uint256 amount, uint256 duration) public {
        amount   = bound(amount,   1, type(uint128).max);
        duration = bound(duration, 1, 365 days);

        vm.prank(alice);
        uint256 loanId = book.createLoan(bob, amount, duration);
        assertEq(loanId, 1);

        LoanBook.Loan memory loan = book.getLoan(loanId);
        assertEq(loan.borrower, alice);
        assertEq(loan.lender,   bob);
        assertEq(loan.amount,   amount);
        assertEq(loan.duration, duration);
        assertEq(uint(loan.state), uint(LoanBook.LoanState.Open));
    }
}
