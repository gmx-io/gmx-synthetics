// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../callback/IDepositCallbackReceiver.sol";
import "../callback/IWithdrawalCallbackReceiver.sol";

import "../token/LockedToken.sol";

contract StakeHandler is IDepositCallbackReceiver, IWithdrawalCallbackReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable depositHandler;
    address public immutable withdrawalHandler;
    IERC20 public immutable depositToken;
    LockedToken public immutable lockedToken;

    modifier onlyDepositHandler() {
        if (msg.sender != depositHandler) {
            revert("StakeHandler: Forbidden");
        }
        _;
    }

    modifier onlyWithdrawalHandler() {
        if (msg.sender != withdrawalHandler) {
            revert("StakeHandler: Forbidden");
        }
        _;
    }

    constructor(
        address _depositHandler,
        address _withdrawalHandler,
        IERC20 _depositToken,
        LockedToken _lockedToken
    ) {
        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        depositToken = _depositToken;
        lockedToken = _lockedToken;
    }

    function afterDepositExecution(
        bytes32 /* key */,
        Deposit.Props memory deposit
    ) external onlyDepositHandler nonReentrant {
        // update claimable amount for account
        uint256 amount = depositToken.balanceOf(address(this));
        depositToken.safeTransfer(address(lockedToken), amount);
        lockedToken.mint(deposit.account, amount);
    }

    function beforeWithdrawalExecution(
        bytes32 /* key */,
        Withdrawal.Props memory withdrawal
    ) external onlyWithdrawalHandler nonReentrant {
        // update claimable amount for account
        address account = withdrawal.account;
        uint256 amount = withdrawal.marketTokensLongAmount + withdrawal.marketTokensShortAmount;
        lockedToken.burn(account, amount);
        lockedToken.transferOut(address(depositToken), amount, account);
    }

    function beforeDepositExecution(bytes32 /* key */, Deposit.Props memory /* deposit */) external {}
    function afterDepositCancellation(bytes32 /* key */, Deposit.Props memory /* deposit */) external {}

    function afterWithdrawalExecution(bytes32 /* key */, Withdrawal.Props memory /* withdrawal */) external {}
    function afterWithdrawalCancellation(bytes32 /* key */, Withdrawal.Props memory /* withdrawal */) external {}

    function updateState() internal {}
}
