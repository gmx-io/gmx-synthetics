// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "./IMultichainProvider.sol";

contract MultichainOrderRouter is MultichainRouter {
    IMultichainProvider multichainProvider;

    constructor(BaseConstructorParams memory params, IMultichainProvider _multichainProvider) MultichainRouter(params) {
        multichainProvider = _multichainProvider;
    }

    // TODO: handle partial fee payment

    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay returns (bytes32) {
        _validateDesChainId(relayParams.desChainId);

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
        _validateDesChainId(relayParams.desChainId);
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
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _cancelOrder(relayParams, account, key, false /* isSubaccount */);
    }

    function bridgeOut(
        RelayUtils.RelayParams calldata relayParams,
        address provider,
        uint32 dstEid,
        address account,
        uint256 srcChainId,
        RelayUtils.BridgeOutParams calldata params
    ) external nonReentrant onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);
        _validateMultichainProvider(dataStore, provider);

        bytes32 structHash = RelayUtils.getBridgeOutStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        multichainProvider.bridgeOut(
            provider,
            dstEid,
            account,
            params.token,
            params.amount
        );
    }

    function _validateMultichainProvider(DataStore dataStore, address provider) internal view {
        bytes32 providerKey = Keys.isMultichainProviderEnabledKey(provider);
        if (!dataStore.getBool(providerKey)) {
            revert Errors.InvalidMultichainProvider(provider);
        }
    }
}
