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
import "../nonce/NonceUtils.sol";

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

    struct UpdateOrderParams {
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
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

    function multicall(bytes[] calldata) external payable virtual override returns (bytes[] memory) {
        // disable multicall for safety
        // https://docs.gelato.network/web3-services/relay/security-considerations/erc-2771-delegatecall-vulnerability#avoid-multicall-in-combination-with-erc-2771
        revert Errors.NotImplemented();
    }

    function createOrder(
        OracleUtils.SetPricesParams calldata oracleParams,
        PermitParams[] calldata permitParams,
        FeeParams calldata feeParams,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 returns (bytes32) {
        // should not use msg.sender directly
        address msgSender = _getMsgSender();

        if (params.addresses.receiver != msgSender) {
            // otherwise malicious relayer can set receiver to any address and steal user's funds
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        _processPermits(permitParams);
        params.numbers.executionFee = _processFee(
            feeParams,
            NonceUtils.getNextKey(dataStore), // order key
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
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 {
        // should not use msg.sender directly
        address msgSender = _getMsgSender();

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        if (order.account() != msgSender) {
            revert Errors.Unauthorized(msgSender, "account for updateOrder");
        }

        _processPermits(permitParams);
        _processFee(feeParams, key, order.uiFeeReceiver(), msgSender);

        orderHandler.updateOrder(
            key,
            params.sizeDeltaUsd,
            params.acceptablePrice,
            params.triggerPrice,
            params.minOutputAmount,
            params.validFromTime,
            params.autoCancel,
            order
        );
    }

    function cancelOrder(
        OracleUtils.SetPricesParams calldata oracleParams,
        PermitParams[] calldata permitParams,
        FeeParams calldata feeParams,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(oracleParams) onlyGelatoRelayERC2771 {
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        if (order.account() == address(0)) {
            revert Errors.EmptyOrder();
        }

        // should not use msg.sender directly
        address msgSender = _getMsgSender();

        if (order.account() != msgSender) {
            revert Errors.Unauthorized(msgSender, "account for cancelOrder");
        }

        _processPermits(permitParams);
        _processFee(feeParams, key, order.uiFeeReceiver(), msgSender);

        orderHandler.cancelOrder(key);
    }

    function _processFee(
        FeeParams calldata feeParams,
        bytes32 orderKey,
        address uiFeeReceiver,
        address residualFeeReceiver
    ) internal returns (uint256) {
        address wnt = TokenUtils.wnt(dataStore);

        if (_getFeeToken() != wnt) {
            revert Errors.InvalidFeeToken(feeParams.feeToken, wnt);
        }

        // should not use msg.sender directly
        address msgSender = _getMsgSender();

        _sendTokens(msgSender, feeParams.feeToken, address(orderVault), feeParams.feeAmount);
        uint256 outputAmount = _swapFeeTokens(wnt, feeParams, orderKey, uiFeeReceiver);
        _transferRelayFee();

        uint256 residualFee = outputAmount - _getFee();
        TokenUtils.transfer(dataStore, wnt, residualFeeReceiver, residualFee);
        return residualFee;
    }

    function _swapFeeTokens(
        address wnt,
        FeeParams calldata feeParams,
        bytes32 orderKey,
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
                key: orderKey,
                tokenIn: feeParams.feeToken,
                amountIn: feeParams.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: _getFee(),
                receiver: address(this),
                uiFeeReceiver: uiFeeReceiver,
                shouldUnwrapNativeToken: false
            })
        );

        if (outputToken != wnt) {
            revert Errors.InvalidSwapOutputToken(outputToken, wnt);
        }

        return outputAmount;
    }

    function _processPermits(PermitParams[] memory permitParams) internal {
        // not all tokens support ERC20Permit, for them separate transaction is needed
        address _router = address(router);

        for (uint256 i; i < permitParams.length; i++) {
            PermitParams memory permit = permitParams[i];

            if (permit.spender != _router) {
                // to avoid permitting spending by an incorrect spender for extra safety
                revert Errors.InvalidPermitSpender(permit.spender, _router);
            }

            if (ERC20(permit.token).allowance(permit.owner, permit.spender) >= permit.value) {
                // allowance is already sufficient
                continue;
            }

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
