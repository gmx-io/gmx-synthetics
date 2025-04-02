// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "./MultichainOrderRouterUtils.sol";

contract MultichainOrderRouter is MultichainRouter {
    IReferralStorage public immutable referralStorage;

    constructor(
        BaseConstructorParams memory params,
        IReferralStorage _referralStorage
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        referralStorage = _referralStorage;
    }

    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePrices(relayParams.oracleParams) onlyGelatoRelay returns (bytes32) {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, collateralDeltaAmount, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(relayParams, account, collateralDeltaAmount, srcChainId, params, false);
    }

    function updateOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external nonReentrant withOraclePrices(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, key, params, increaseExecutionFee);
        _validateCall(relayParams, account, structHash, srcChainId);

        // top-up user's multichain balance from order/position collateral if user's multichain balance is insufficient to pay fees
        MultichainOrderRouterUtils.handleFeePayment(
            MultichainOrderRouterUtils.HandleFeePaymentContracts({
                dataStore: dataStore,
                eventEmitter: eventEmitter,
                multichainVault: multichainVault,
                oracle: oracle,
                referralStorage: referralStorage,
                orderVault: orderVault
            }),
            relayParams,
            account,
            srcChainId,
            key
        );

        _updateOrder(relayParams, account, key, params, increaseExecutionFee, false);
    }

    function cancelOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) external nonReentrant withOraclePrices(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        // top-up user's multichain balance from order/position collateral if user's multichain balance is insufficient to pay fees
        MultichainOrderRouterUtils.handleFeePayment(
            MultichainOrderRouterUtils.HandleFeePaymentContracts({
                dataStore: dataStore,
                eventEmitter: eventEmitter,
                multichainVault: multichainVault,
                oracle: oracle,
                referralStorage: referralStorage,
                orderVault: orderVault
            }),
            relayParams,
            account,
            srcChainId,
            key
        );

        _cancelOrder(relayParams, account, key, false /* isSubaccount */);
    }
}
