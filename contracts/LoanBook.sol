// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LoanBook
/// @notice Private community P2P USDC micro-loan registry.
/// @dev This contract never custodies funds. It coordinates direct lender->borrower
///      and borrower->lender transfers via ERC-20 allowances.
contract LoanBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LoanState {
        Open,
        Funded,
        Repaid,
        Cancelled
    }

    struct Loan {
        address borrower;
        address lender;
        uint256 amount; // USDC in 6-decimal units (e.g. 5_000_000 = 5 USDC)
        uint256 duration; // seconds
        uint256 createdAt;
        uint256 fundedAt;
        uint256 dueDate; // set when funded, not at creation
        LoanState state;
    }

    error LoanBook__ZeroAmount();
    error LoanBook__ZeroDuration();
    error LoanBook__InvalidLender();
    error LoanBook__InvalidUSDC();
    error LoanBook__SelfLend();
    error LoanBook__NotBorrower();
    error LoanBook__NotLender();
    error LoanBook__InvalidState(uint256 loanId, LoanState actual, LoanState expected);
    error LoanBook__LoanNotFound(uint256 loanId);

    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed lender,
        uint256 amount,
        uint256 duration
    );
    event LoanFunded(
        uint256 indexed loanId,
        address indexed lender,
        address indexed borrower,
        uint256 amount,
        uint256 dueDate
    );
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed lender,
        uint256 amount,
        uint256 repaidAt
    );
    event LoanCancelled(uint256 indexed loanId, address indexed borrower, uint256 cancelledAt);

    mapping(uint256 => Loan) public loans;
    uint256 public loanCount;
    IERC20 public immutable usdc;

    /// @param usdc_ Address of USDC token contract on the target network.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert LoanBook__InvalidUSDC();
        if (usdc_.code.length == 0) revert LoanBook__InvalidUSDC();
        usdc = IERC20(usdc_);
    }

    /// @notice Create a new loan request addressed to a specific lender.
    /// @param lender Intended lender for this loan.
    /// @param amount Loan principal amount in USDC 6-decimal units.
    /// @param duration Loan duration in seconds.
    /// @return loanId Newly created loan ID.
    function createLoan(address lender, uint256 amount, uint256 duration) external returns (uint256 loanId) {
        address borrower = msg.sender;

        if (lender == address(0)) revert LoanBook__InvalidLender();
        if (lender == borrower) revert LoanBook__SelfLend();
        if (amount == 0) revert LoanBook__ZeroAmount();
        if (duration == 0) revert LoanBook__ZeroDuration();

        loanId = ++loanCount; // starts IDs at 1

        loans[loanId] = Loan({
            borrower: borrower,
            lender: lender,
            amount: amount,
            duration: duration,
            createdAt: block.timestamp,
            fundedAt: 0,
            dueDate: 0,
            state: LoanState.Open
        });

        emit LoanCreated(loanId, borrower, lender, amount, duration);
    }

    /// @notice Fund an open loan by transferring USDC directly to the borrower.
    /// @dev Checks-effects-interactions: state updates happen before transfer.
    /// @param loanId ID of the loan to fund.
    function fundLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = _getExistingLoan(loanId);

        if (msg.sender != loan.lender) revert LoanBook__NotLender();
        if (loan.state != LoanState.Open) {
            revert LoanBook__InvalidState(loanId, loan.state, LoanState.Open);
        }

        loan.state = LoanState.Funded;
        loan.fundedAt = block.timestamp;
        loan.dueDate = block.timestamp + loan.duration;

        usdc.safeTransferFrom(msg.sender, loan.borrower, loan.amount);

        emit LoanFunded(loanId, loan.lender, loan.borrower, loan.amount, loan.dueDate);
    }

    /// @notice Repay a funded loan by transferring USDC directly to the lender.
    /// @dev Checks-effects-interactions: state updates happen before transfer.
    /// @param loanId ID of the loan to repay.
    function repayLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = _getExistingLoan(loanId);

        if (msg.sender != loan.borrower) revert LoanBook__NotBorrower();
        if (loan.state != LoanState.Funded) {
            revert LoanBook__InvalidState(loanId, loan.state, LoanState.Funded);
        }

        loan.state = LoanState.Repaid;

        usdc.safeTransferFrom(msg.sender, loan.lender, loan.amount);

        emit LoanRepaid(loanId, loan.borrower, loan.lender, loan.amount, block.timestamp);
    }

    /// @notice Cancel an open loan request.
    /// @param loanId ID of the loan to cancel.
    function cancelLoan(uint256 loanId) external {
        Loan storage loan = _getExistingLoan(loanId);

        if (msg.sender != loan.borrower) revert LoanBook__NotBorrower();
        if (loan.state != LoanState.Open) {
            revert LoanBook__InvalidState(loanId, loan.state, LoanState.Open);
        }

        loan.state = LoanState.Cancelled;

        emit LoanCancelled(loanId, loan.borrower, block.timestamp);
    }

    /// @notice Return the full loan struct for a valid loan ID.
    /// @param loanId ID of the loan.
    /// @return Loan data.
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        Loan storage loan = _getExistingLoan(loanId);
        return loan;
    }

    /// @notice Whether a funded loan is overdue.
    /// @param loanId ID of the loan.
    /// @return True when funded and current timestamp is past due date.
    function isOverdue(uint256 loanId) external view returns (bool) {
        Loan storage loan = _getExistingLoan(loanId);
        if (loan.state != LoanState.Funded) return false;
        return block.timestamp > loan.dueDate;
    }

    /// @dev Validates loan existence and returns storage reference.
    function _getExistingLoan(uint256 loanId) internal view returns (Loan storage loan) {
        if (loanId == 0 || loanId > loanCount) revert LoanBook__LoanNotFound(loanId);
        loan = loans[loanId];
    }
}
