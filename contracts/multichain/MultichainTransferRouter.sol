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
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getBridgeInStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, params.token, account, srcChainId);
        
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
