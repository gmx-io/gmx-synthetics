// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";

contract MultichainGmRouter is MultichainRouter {
    constructor(BaseConstructorParams memory params) MultichainRouter(params) {}

    // TODO: handle partial fee payment

    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant onlyGelatoRelay returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, collateralDeltaAmount, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(relayParams, account, srcChainId, collateralDeltaAmount, params, false);
    }

    function updateOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, key, params, increaseExecutionFee);
        _validateCall(relayParams, account, structHash, srcChainId);

        _updateOrder(relayParams, account, key, params, increaseExecutionFee, false);
    }

    function cancelOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _cancelOrder(relayParams, account, key);
    }
}
