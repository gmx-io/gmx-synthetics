// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "./MultichainOrderRouterUtils.sol";

contract MultichainOrderRouter is MultichainRouter {
    IReferralStorage public immutable referralStorage;

    // @dev same logic as withRelay, but the additional orderKey param
    // and uses _handleRelayBeforeActionForOrders instead of _handleRelayBeforeAction
    // to allow paying the relayFee from order/position collateral
    modifier withRelayForOrders(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 orderKey,
        bool isSubaccount
    ) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        Contracts memory contracts = _getContracts();
        _handleRelayBeforeActionForOrders(contracts, relayParams, account, srcChainId, orderKey, isSubaccount);
        _;
        _handleRelayAfterAction(contracts, startingGas, account, srcChainId);
    }

    constructor(
        BaseConstructorParams memory params,
        IReferralStorage _referralStorage
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        referralStorage = _referralStorage;
    }

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
        withRelayForOrders(relayParams, account, srcChainId, params.key, false)
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
        withRelayForOrders(relayParams, account, srcChainId, key, false)
    {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _cancelOrder(account, key);
    }

    // @dev same logic as _handleRelayBeforeAction, but with the additional orderKey param
    // to allow paying the relayFee from order/position collateral
    function _handleRelayBeforeActionForOrders(
        Contracts memory contracts,
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 orderKey,
        bool isSubaccount
    ) private withOraclePricesForAtomicAction(relayParams.oracleParams) {
        _handleTokenPermits(relayParams.tokenPermits);
        _handleExternalCalls(account, srcChainId, relayParams.externalCalls, isSubaccount);

        // top-up user's multichain balance from order/position collateral if user's multichain balance is insufficient to pay fees
        MultichainOrderRouterUtils.transferFeeFromOrderOrPosition(
            MultichainOrderRouterUtils.TransferFeeFromOrderOrPositionContracts({
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

        _handleRelayFee(contracts, relayParams, account, srcChainId, isSubaccount);
    }
}
