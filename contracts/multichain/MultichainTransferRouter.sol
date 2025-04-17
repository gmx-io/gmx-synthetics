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
    function bridgeIn(address account, address token, uint256 srcChainId) external payable nonReentrant {
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, token, account, srcChainId);
    }

    function bridgeOut(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        BridgeOutParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getBridgeOutStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _bridgeOut(account, srcChainId, params);
    }

    function _bridgeOut(
        address account,
        uint256 srcChainId,
        BridgeOutParams calldata params
    ) internal {
        if (srcChainId == block.chainid) {
            // same-chain withdrawal: funds are sent directly to the user's wallet
            MultichainUtils.transferOut(
                dataStore,
                eventEmitter,
                multichainVault,
                params.token,
                account,
                address(this), // receiver
                params.amount,
                srcChainId
            );

            TokenUtils.transfer(dataStore, params.token, account, params.amount);

            MultichainEventUtils.emitMultichainBridgeOut(
                eventEmitter,
                address(0), // provider
                params.token,
                account,
                params.amount, // amount
                0 // srcChainId
            );
        } else {
            // cross-chain withdrawal: using the multichain provider, funds are bridged to the src chain
            MultichainUtils.validateMultichainProvider(dataStore, params.provider);

            // transfer funds (amount + bridging fee) from user's multichain balance to multichainProvider
            // and execute the bridge out to srcChain
            uint256 amountOut = multichainProvider.bridgeOut(
                IMultichainProvider.BridgeOutParams({
                    provider: params.provider,
                    account: account,
                    token: params.token,
                    amount: params.amount,
                    srcChainId: srcChainId,
                    data: params.data
                })
            );

            MultichainEventUtils.emitMultichainBridgeOut(
                eventEmitter,
                params.provider,
                params.token,
                account,
                amountOut, // amount
                srcChainId
            );
        }
    }
}
