// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../bank/Bank.sol";
import "../market/Market.sol";

import "../oracle/IOracle.sol";
import "../pricing/ISwapPricingUtils.sol";

interface ISwapUtils {
    event SwapReverted(string reason, bytes reasonBytes);

    /**
     * @param dataStore The contract that provides access to data stored on-chain.
     * @param eventEmitter The contract that emits events.
     * @param oracle The contract that provides access to price data from oracles.
     * @param bank The contract providing the funds for the swap.
     * @param key An identifying key for the swap.
     * @param tokenIn The address of the token that is being swapped.
     * @param amountIn The amount of the token that is being swapped.
     * @param swapPathMarkets An array of market properties, specifying the markets in which the swap should be executed.
     * @param minOutputAmount The minimum amount of tokens that should be received as part of the swap.
     * @param receiver The address to which the swapped tokens should be sent.
     * @param uiFeeReceiver The address of the ui fee receiver.
     * @param uiFeeFactor The UI fee factor to use, or type(uint256).max to read the current configured factor.
     * @param tokenInPoolAmountBeforeAction The tokenIn pool amount before a same-bank action that already debited tokenIn.
     * Pass 0 for regular swaps to keep maxPoolAmount validation enabled.
     * @param shouldUnwrapNativeToken A boolean indicating whether the received tokens should be unwrapped from the wrapped native token (WNT) if they are wrapped.
     */
    struct SwapParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        IOracle oracle;
        Bank bank;
        bytes32 key;
        address tokenIn;
        uint256 amountIn;
        Market.Props[] swapPathMarkets;
        uint256 minOutputAmount;
        address receiver;
        address uiFeeReceiver;
        uint256 uiFeeFactor;
        uint256 tokenInPoolAmountBeforeAction; 
        bool shouldUnwrapNativeToken;
        ISwapPricingUtils.SwapPricingType swapPricingType;
    }
}
