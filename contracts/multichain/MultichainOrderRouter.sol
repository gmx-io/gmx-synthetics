// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "./MultichainOrderRouterUtils.sol";

contract MultichainOrderRouter is MultichainRouter {
    IReferralStorage public immutable referralStorage;

    // @dev must be placed before withRelay modifier because
    // user's multichain balance must be topped-up before _handleRelayFee transfers the feeAmount
    modifier handleFeePayment(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 orderKey
    ) {
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
            orderKey
        );
        _;
    }

    constructor(
        BaseConstructorParams memory params,
        IReferralStorage _referralStorage
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        referralStorage = _referralStorage;
    }

    function batch(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false, false) returns (bytes32[] memory) {
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
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(account, srcChainId, params, false);
    }

    function updateOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        UpdateOrderParams calldata params
    )
        external
        nonReentrant
        handleFeePayment(relayParams, account, srcChainId, params.key)
        withRelay(relayParams, account, srcChainId, false, false)
    {
        _handleUpdateOrder(relayParams, account, srcChainId, params);

        _updateOrder(account, params, false);
    }

    // @dev needed to keep `updateOrder` under the stack limit
    function _handleUpdateOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        UpdateOrderParams calldata params
    ) private {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);
    }

    function cancelOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    )
        external
        nonReentrant
        handleFeePayment(relayParams, account, srcChainId, key)
        withRelay(relayParams, account, srcChainId, false, false)
    {
        _handleCancelOrder(relayParams, account, srcChainId, key);

        _cancelOrder(account, key);
    }

    function _handleCancelOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) private {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);
    }
}
