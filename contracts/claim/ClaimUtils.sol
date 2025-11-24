// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "./ClaimEventUtils.sol";

library ClaimUtils {
    using SafeERC20 for IERC20;

    struct DepositParam {
        address account;
        uint256 amount;
    }

    function incrementClaims(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address token,
        uint256 distributionId,
        DepositParam[] calldata params
    ) external returns (uint256) {
        if (params.length == 0) {
            revert Errors.InvalidParams("deposit params length is 0");
        }
        _validateNonEmptyToken(token);
        _validateNonZeroDistributionId(distributionId);

        uint256 totalTransferAmount;

        for (uint256 i = 0; i < params.length; i++) {
            DepositParam memory param = params[i];

            _validateNonEmptyAccount(param.account);
            if (param.amount == 0) {
                revert Errors.EmptyAmount();
            }

            uint256 nextAmount = dataStore.incrementUint(
                Keys.claimableFundsAmountKey(param.account, token, distributionId),
                param.amount
            );

            totalTransferAmount += param.amount;

            ClaimEventUtils.emitClaimFundsDeposited(
                eventEmitter,
                param.account,
                token,
                distributionId,
                param.amount,
                nextAmount
            );
        }

        return totalTransferAmount;
    }

    function _validateNonZeroDistributionId(uint256 distributionId) internal pure {
        if (distributionId == 0) {
            revert Errors.InvalidParams("distributionId is 0");
        }
    }

    function _validateNonEmptyAccount(address account) internal pure {
        if (account == address(0)) {
            revert Errors.EmptyAccount();
        }
    }

    function _validateNonEmptyToken(address token) internal pure {
        if (token == address(0)) {
            revert Errors.EmptyToken();
        }
    }

    function _validateTotalClaimableFundsAmount(DataStore dataStore, address token, address claimVault) internal view {
        // invariant check
        uint256 totalAmountLeft = dataStore.getUint(Keys.totalClaimableFundsAmountKey(token));
        if (totalAmountLeft > IERC20(token).balanceOf(address(claimVault))) {
            revert Errors.InsufficientFunds(token);
        }
    }
}
