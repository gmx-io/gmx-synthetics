// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {GelatoRelayContextERC2771} from "@gelatonetwork/relay-context/contracts/GelatoRelayContextERC2771.sol";

import "./BaseRouter.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../exchange/IOrderHandler.sol";
import "../external/IExternalHandler.sol";
import "../oracle/OracleModule.sol";
import "../order/IBaseOrderUtils.sol";
import "../order/OrderStoreUtils.sol";
import "../order/OrderVault.sol";
import "../router/Router.sol";
import "../token/TokenUtils.sol";
import "../swap/SwapUtils.sol";

contract GelatoRelayRouter is GelatoRelayContextERC2771, BaseRouter, OracleModule {
    using Order for Order.Props;

    IOrderHandler public immutable orderHandler;
    IExternalHandler public immutable externalHandler;
    OrderVault public immutable orderVault;

    struct PermitParams {
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
        address token;
    }

    struct FeeParams {
        address feeToken;
        uint256 feeAmount;
        address[] feeSwapPath;
    }

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) OracleModule(_oracle) {
        orderHandler = _orderHandler;
        externalHandler = _externalHandler;
        orderVault = _orderVault;
    }

    // TODO override multicall, it should not be allowed

    function createOrder(
        OracleUtils.SetPricesParams calldata oracleParams,
        PermitParams[] calldata permitParams,
        FeeParams calldata feeParams,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify it
    ) external nonReentrant withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 returns (bytes32) {
        address msgSender = _getMsgSender();

        if (params.addresses.receiver != msgSender) {
            // otherwise malicious relayer can set receiver to any address and steal user's funds
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        _processPermits(permitParams);
        params.numbers.executionFee = _processFee(
            feeParams,
            msgSender,
            params.addresses.uiFeeReceiver,
            address(orderVault)
        );

        if (collateralAmount > 0) {
            _sendTokens(msgSender, params.addresses.initialCollateralToken, address(orderVault), collateralAmount);
        }

        return orderHandler.createOrder(msgSender, params);
    }

    function updateOrder(
        OracleUtils.SetPricesParams calldata oracleParams,
        PermitParams[] calldata permitParams,
        FeeParams calldata feeParams,
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount,
        uint256 validFromTime,
        bool autoCancel
    ) external withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 nonReentrant {
        address msgSender = _getMsgSender();

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        if (order.account() != msgSender) {
            revert Errors.Unauthorized(msgSender, "account for updateOrder");
        }

        _processPermits(permitParams);
        _processFee(feeParams, msgSender, order.uiFeeReceiver(), msgSender);

        orderHandler.updateOrder(
            key,
            sizeDeltaUsd,
            acceptablePrice,
            triggerPrice,
            minOutputAmount,
            validFromTime,
            autoCancel,
            order
        );
    }

    function cancelOrder(
        OracleUtils.SetPricesParams calldata oracleParams,
        PermitParams[] calldata permitParams,
        FeeParams calldata feeParams,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 {
        address msgSender = _getMsgSender();

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        if (order.account() != msgSender) {
            revert Errors.Unauthorized(msgSender, "account for cancelOrder");
        }

        _processPermits(permitParams);
        _processFee(feeParams, msgSender, order.uiFeeReceiver(), msgSender);

        orderHandler.cancelOrder(key);
    }

    function _processFee(
        FeeParams calldata feeParams,
        address account,
        address uiFeeReceiver,
        address residualFeeReceiver
    ) internal returns (uint256) {
        address wnt = TokenUtils.wnt(dataStore);

        _sendTokens(account, feeParams.feeToken, address(orderVault), feeParams.feeAmount);
        uint256 outputAmount = _swapFeeTokens(wnt, feeParams, uiFeeReceiver);
        _transferRelayFee();

        uint256 residualFee = outputAmount - _getFee();
        TokenUtils.transfer(dataStore, wnt, residualFeeReceiver, residualFee);
        return residualFee;
    }

    function _swapFeeTokens(
        address wnt,
        FeeParams calldata feeParams,
        address uiFeeReceiver
    ) internal returns (uint256) {
        // swap fee tokens to WNT
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(dataStore, feeParams.feeSwapPath);

        (address outputToken, uint256 outputAmount) = SwapUtils.swap(
            SwapUtils.SwapParams({
                dataStore: dataStore,
                eventEmitter: eventEmitter,
                oracle: oracle,
                bank: orderVault,
                key: bytes32(0), // TODO
                tokenIn: feeParams.feeToken,
                amountIn: feeParams.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: 0,
                receiver: address(this),
                uiFeeReceiver: uiFeeReceiver,
                shouldUnwrapNativeToken: false
            })
        );
        // TODO should call recordTransferIn?

        if (outputToken != wnt) {
            revert Errors.InvalidSwapOutputToken(outputToken, wnt);
        }

        return outputAmount;
    }

    function _processPermits(PermitParams[] memory permitParams) internal {
        // TODO checks if Router already has sufficient allowance
        for (uint256 i; i < permitParams.length; i++) {
            PermitParams memory permit = permitParams[i];
            IERC20Permit(permit.token).permit(
                permit.owner,
                permit.spender,
                permit.value,
                permit.deadline,
                permit.v,
                permit.r,
                permit.s
            );
        }
    }

    function _sendTokens(address account, address token, address receiver, uint256 amount) internal {
        AccountUtils.validateReceiver(receiver);
        router.pluginTransfer(token, account, receiver, amount);
    }
}
