// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../oracle/OracleUtils.sol";
import "../../order/IBaseOrderUtils.sol";

interface IRelayUtils {
    struct FeeParams {
        // 1. if no swap is needed then `feeToken` should be WNT address, `feeAmount` should be correct amount and `feeSwapPath` should be empty
        // 2. if GMX v2 swap is used to swap relay fee then `feeToken` should be the address of the input token,
        //    `feeAmount` should be the amount of the input token enough to cover the relay fee in WNT, and `feeSwapPath` should be the list of markets
        //    through which the input token should be swapped to get the output token
        // 3. if external calls are used then `feeToken` should be WNT address (even though the input token is different)
        //    `feeAmount` should be 0 because the input token and amount will be specified in `externalCalls`
        //    `feeSwapPath` should be empty
        address feeToken;
        uint256 feeAmount;
        address[] feeSwapPath;
    }

    struct TokenPermit {
        // EIP-2612 permit https://eips.ethereum.org/EIPS/eip-2612
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
        address token;
    }

    // external calls could be used to swap relay fee and/or position collateral
    // GMX v2 swaps consume relatively a lot of gas, so using external calls could reduce txn fee
    // for relay fee the funds should be sent to the RelayRouter contract
    // for position collateral the funds should be sent to the OrderVault contract
    //
    // @note when using external calls for position collateral and creating multiple orders via `batch()`
    // then the funds will be allocated to the first increase order because all external calls are processed first
    // and only then OrderVault's balance is used for order's initialCollateralDeltaAmount
    //
    // @note using external calls for position collateral and atomic swaps for relay fee at the same time should be done with caution
    // if position collateral and initial relay fee token are the same then the collateral will be lost
    // for example, a user wants to pay ARB to open a position with USDC as collateral and pay USDC as a relay fee
    // 1. external calls swap ARB for USDC and sends USDC to the OrderVault to use as position collateral
    // 2. USDC is sent to the OrderVault before the swap
    // 3. on swap OrderVault.tokenBalances are synced
    // 4. on order creation OrderVault.recordTransferInt returns 0
    // 5. the collateral is lost
    struct ExternalCalls {
        // Gelato Relay Router contracts do not support `multicall` and `sendTokens` methods
        // so all tokens and amounts should be specified here
        address[] sendTokens; // tokens to send to ExternalHandler
        uint256[] sendAmounts; // tokens amounts to send to ExternalHandler
        // lists of external calls to be made
        address[] externalCallTargets; // external targets to call
        bytes[] externalCallDataList; // external call data list
        // refundTokens and refundReceivers are used to send residual funds left in the ExchangeHandler
        // for example, if "swapExactOut" is used some amount of "tokenIn" could be lefts
        address[] refundTokens; // tokens to refund to user
        address[] refundReceivers; // receivers of the refunds
    }

    struct RelayParams {
        // oracle params are used for relay fee swap through GMX v2 pools
        // if swap is not needed then `oracleParams` values should be empty
        OracleUtils.SetPricesParams oracleParams;
        ExternalCalls externalCalls;
        // token permits could be used to approve spending of tokens by the Router contract
        // instead of sending separate approval transactions
        TokenPermit[] tokenPermits;
        FeeParams fee;
        // interface generates a random nonce
        uint256 userNonce;
        // deadline for the transaction. should be used for extra safety so signed message
        // can't be used in future if a user signs and forgets about it
        uint256 deadline;
        bytes signature;
        uint256 desChainId;
    }

    struct TransferRequests {
        address[] tokens;
        address[] receivers;
        uint256[] amounts;
    }

    struct BridgeOutParams {
        address token;
        uint256 amount;
        uint256 minAmountOut;
        address provider;
        bytes data; // provider specific data e.g. dstEid
    }

    // @note all params except account should be part of the corresponding struct hash
    struct UpdateOrderParams {
        bytes32 key;
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
        // should be non zero if order's execution fee should be increased
        // otherwise should be 0
        uint256 executionFeeIncrease;
    }

    struct BatchParams {
        IBaseOrderUtils.CreateOrderParams[] createOrderParamsList;
        UpdateOrderParams[] updateOrderParamsList;
        bytes32[] cancelOrderKeys;
    }
}
