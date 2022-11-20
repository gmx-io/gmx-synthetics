// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../callback/IDepositCallbackReceiver.sol";
import "../token/LockedToken.sol";

contract StakeHandler is IDepositCallbackReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable depositHandler;
    IERC20 public immutable depositToken;
    LockedToken public immutable lockedToken;

    modifier onlyDepositHandler() {
        if (msg.sender != depositHandler) {
            revert("StakeHandler: Forbidden");
        }
        _;
    }

    constructor(
        address _depositHandler,
        IERC20 _depositToken,
        LockedToken _lockedToken
    ) {
        depositHandler = _depositHandler;
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

    /* function withdrawStake(uint256 amount, address receiver) external onlyController nonReentrant {
        address account = msg.sender;
        _lockedToken.burn(account, amount);
        _lockedToken.transferOut(depositToken, amount, receiver);
    } */

    function beforeDepositExecution(bytes32 /* key */, Deposit.Props memory /* deposit */) external {}
    function afterDepositCancellation(bytes32 /* key */, Deposit.Props memory /* deposit */) external {}

    function updateState() internal {

    }
}
