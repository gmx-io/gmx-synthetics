// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "./MultichainUtils.sol";
import "./IMultichainProvider.sol";

contract MultichainTransferRouter is MultichainRouter {
    IMultichainProvider multichainProvider;

    constructor(
        BaseConstructorParams memory params,
        IMultichainProvider _multichainProvider
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        multichainProvider = _multichainProvider;
    }

    /**
     * payable function so that it can be called as a multicall
     * if a user is liquidated or ADLed, the funds would be sent to the user's account on Arbitrum
     * this would be used to move those funds into their multichain balance
     */
    function bridgeIn(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        RelayUtils.BridgeInParams calldata params
    ) external payable nonReentrant onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);

        bytes32 structHash = RelayUtils.getBridgeInStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        MultichainUtils.recordTransferIn(
            dataStore,
            eventEmitter,
            multichainVault,
            params.token,
            account,
            srcChainId
        );
    }

    function bridgeOut(
        RelayUtils.RelayParams calldata relayParams,
        address provider,
        address receiver,
        uint256 srcChainId,
        bytes calldata data, // encoded provider specific data e.g. dstEid
        RelayUtils.BridgeOutParams calldata params
    ) external nonReentrant onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);
        _validateMultichainProvider(dataStore, provider);

        bytes32 structHash = RelayUtils.getBridgeOutStructHash(relayParams, params);
        _validateCall(relayParams, receiver, structHash, srcChainId);

        multichainProvider.bridgeOut(
            provider,
            receiver,
            params.token,
            params.amount,
            data
        );
    }

    function _validateMultichainProvider(DataStore dataStore, address provider) internal view {
        bytes32 providerKey = Keys.isMultichainProviderEnabledKey(provider);
        if (!dataStore.getBool(providerKey)) {
            revert Errors.InvalidMultichainProvider(provider);
        }
    }
}
