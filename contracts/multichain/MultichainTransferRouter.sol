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
     * this would be used to move user's funds from their Arbitrum account into their multichain balance
     */
    function bridgeIn(
        address account,
        address token,
        uint256 srcChainId
    ) external payable nonReentrant {
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, token, account, srcChainId);
    }

    function bridgeOut(
        RelayUtils.RelayParams calldata relayParams,
        address provider,
        address account,
        uint256 srcChainId,
        bytes calldata data, // encoded provider specific data e.g. dstEid
        RelayUtils.BridgeOutParams calldata params
    ) external nonReentrant onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();
        _validateMultichainProvider(dataStore, provider);

        bytes32 structHash = RelayUtils.getBridgeOutStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);
        
        // orderVault is used to transfer funds into it and do a swap from feeToken to wnt when using the feeSwapPath
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: orderVault
        });
        _handleRelay(
            contracts,
            relayParams,
            account,
            srcChainId == 0 ? account : address(multichainVault), // residualFeeReceiver
            false, // isSubaccount
            srcChainId
        );

        multichainProvider.bridgeOut(provider, account, params.token, params.amount, srcChainId, data);
        MultichainEventUtils.emitMultichainBridgeOut(
            eventEmitter,
            provider,
            params.token,
            account,
            params.amount,
            srcChainId
        );
    }

    function _validateMultichainProvider(DataStore dataStore, address provider) internal view {
        bytes32 providerKey = Keys.isMultichainProviderEnabledKey(provider);
        if (!dataStore.getBool(providerKey)) {
            revert Errors.InvalidMultichainProvider(provider);
        }
    }
}
