// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

import "./PositionUtils.sol";
import "../swap/SwapUtils.sol";

library DecreasePositionSwapUtils {
    using Order for Order.Props;
    using Position for Position.Props;

    // swap the withdrawn collateral from collateralToken to pnlToken if needed
    function swapWithdrawnCollateralToPnlToken(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCollateralValues memory values
    ) external returns (PositionUtils.DecreasePositionCollateralValues memory) {
        if (values.output.outputAmount > 0 && params.order.decreasePositionSwapType() == Order.DecreasePositionSwapType.SwapCollateralTokenToPnlToken) {
            Market.Props[] memory swapPathMarkets = new Market.Props[](1);
            swapPathMarkets[0] = params.market;

            try params.contracts.swapHandler.swap(
                ISwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    Bank(payable(params.market.marketToken)),
                    params.orderKey,
                    params.position.collateralToken(), // tokenIn
                    values.output.outputAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    params.order.uiFeeReceiver(), // uiFeeReceiver
                    params.order.uiFeeFactor(), // uiFeeFactor
                    0, // tokenInPoolAmountBeforeAction
                    false, // shouldUnwrapNativeToken
                    ISwapPricingUtils.SwapPricingType.Swap
                )
            ) returns (address tokenOut, uint256 swapOutputAmount) {
                if (tokenOut != values.output.secondaryOutputToken) {
                    revert Errors.InvalidOutputToken(tokenOut, values.output.secondaryOutputToken);
                }
                // combine the values into outputToken and outputAmount
                values.output.outputToken = tokenOut;
                values.output.outputAmount = values.output.secondaryOutputAmount + swapOutputAmount;
                values.output.secondaryOutputAmount = 0;
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason, "");
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                emit SwapUtils.SwapReverted(reason, reasonBytes);
            }
        }

        return values;
    }

    // swap the realized profit from the pnlToken to the collateralToken if needed
    function swapProfitToCollateralToken(
        PositionUtils.UpdatePositionParams memory params,
        PositionUtils.DecreasePositionCollateralValues memory values
    ) external returns (PositionUtils.DecreasePositionCollateralValues memory) {
        if (values.output.secondaryOutputAmount > 0 && params.order.decreasePositionSwapType() == Order.DecreasePositionSwapType.SwapPnlTokenToCollateralToken) {
            Market.Props[] memory swapPathMarkets = new Market.Props[](1);
            swapPathMarkets[0] = params.market;

            bytes32 poolAmountKey = Keys.poolAmountKey(params.market.marketToken, values.output.secondaryOutputToken);
            uint256 poolAmountBeforeSwap = params.contracts.dataStore.getUint(poolAmountKey);

            try params.contracts.swapHandler.swap(
                ISwapUtils.SwapParams(
                    params.contracts.dataStore,
                    params.contracts.eventEmitter,
                    params.contracts.oracle,
                    Bank(payable(params.market.marketToken)),
                    params.orderKey,
                    values.output.secondaryOutputToken, // tokenIn
                    values.output.secondaryOutputAmount, // amountIn
                    swapPathMarkets, // markets
                    0, // minOutputAmount
                    params.market.marketToken, // receiver
                    params.order.uiFeeReceiver(), // uiFeeReceiver
                    params.order.uiFeeFactor(), // uiFeeFactor
                    0, // tokenInPoolAmountBeforeAction
                    false, // shouldUnwrapNativeToken
                    ISwapPricingUtils.SwapPricingType.Swap
                )
            ) returns (address /* tokenOut */, uint256 swapOutputAmount) {
                // The swap returns pnl tokens to this same pool. Do not restore them
                // again when reconstructing backing for future capped decreases.
                // Measure the actual raw pool credit, which accounts for swap fees
                // and impact; the gross input and collateral-token output do not.
                uint256 poolAmountAfterSwap = params.contracts.dataStore.getUint(poolAmountKey);
                if (poolAmountAfterSwap > poolAmountBeforeSwap) {
                    // The input may include positive-impact tokens not counted as base pnl.
                    // Net only this decrease's base-pnl debit, not the position's older history.
                    values.basePnlPoolTokenAmount -= Math.min(
                        values.basePnlPoolTokenAmount,
                        poolAmountAfterSwap - poolAmountBeforeSwap
                    );
                }

                values.output.outputAmount += swapOutputAmount;
                values.output.secondaryOutputAmount = 0;
            } catch Error(string memory reason) {
                emit SwapUtils.SwapReverted(reason, "");
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                emit SwapUtils.SwapReverted(reason, reasonBytes);
            }
        }

        return values;
    }
}
