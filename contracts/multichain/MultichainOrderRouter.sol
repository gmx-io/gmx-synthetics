// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";

contract MultichainOrderRouter is MultichainRouter {
    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    function batch(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32[] memory) {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return
            _batch(
                account,
                srcChainId,
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys,
                false // isSubaccount
            );
    }

    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(account, srcChainId, params, false);
    }

    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        UpdateOrderParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, srcChainId, false)
    {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _updateOrder(account, params, false);
    }

    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    )
        external
        nonReentrant
        withRelay(relayParams, account, srcChainId, false)
    {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _cancelOrder(account, key);
    }
}
