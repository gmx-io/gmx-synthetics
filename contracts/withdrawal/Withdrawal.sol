// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title Withdrawal
 * @dev Struct for withdrawals
 */
library Withdrawal {
    /**
     * @param account The account to withdraw for.
     * @param receiver The address that will receive the withdrawn tokens.
     * @param callbackContract The contract that will be called back.
     * @param market The market on which the withdrawal will be executed.
     * @param marketTokensLongAmount The amount of long market tokens that will be withdrawn.
     * @param marketTokensShortAmount The amount of short market tokens that will be withdrawn.
     * @param minLongTokenAmount The minimum amount of long tokens that must be withdrawn.
     * @param minShortTokenAmount The minimum amount of short tokens that must be withdrawn.
     * @param updatedAtBlock The block at which the withdrawal was last updated.
     * @param shouldUnwrapNativeToken Whether the native token should be unwrapped when executing the withdrawal.
     * @param executionFee The execution fee for the withdrawal.
     * @param callbackGasLimit The gas limit for calling the callback contract.
     * @param data Additional data for the withdrawal.
     */
    struct Props {
        address account;
        address receiver;
        address callbackContract;
        address market;
        uint256 marketTokensLongAmount;
        uint256 marketTokensShortAmount;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        uint256 updatedAtBlock;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes data;
    }
}
