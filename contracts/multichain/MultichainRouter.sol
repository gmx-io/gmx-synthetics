// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/GelatoRelayRouter.sol";

import "./MultichainUtils.sol";

abstract contract MultichainRouter is GelatoRelayRouter {

    struct BaseConstructorParams {
        Router router;
        DataStore dataStore;
        EventEmitter eventEmitter;
        Oracle oracle;
        OrderVault orderVault;
        IOrderHandler orderHandler;
        IExternalHandler externalHandler;
        MultichainVault multichainVault;
    }

    MultichainVault public immutable multichainVault;

    constructor(
        BaseConstructorParams memory params
    )
        GelatoRelayRouter(
            params.router,
            params.dataStore,
            params.eventEmitter,
            params.oracle,
            params.orderHandler,
            params.orderVault,
            params.externalHandler
        )
    {
        multichainVault = params.multichainVault;
    }

    function _processTransferRequests(address account, RelayUtils.TransferRequest[] calldata transferRequests, uint256 srcChainId) internal {
        for (uint256 i = 0; i < transferRequests.length; i++) {
            RelayUtils.TransferRequest calldata transferRequest = transferRequests[i];
            _sendTokens(account, transferRequest.token, transferRequest.receiver, transferRequest.amount, srcChainId);
        }
    }

    function _sendTokens(address account, address token, address receiver, uint256 amount, uint256 srcChainId) internal override {
        AccountUtils.validateReceiver(receiver);
        if (srcChainId == 0) {
            router.pluginTransfer(token, account, receiver, amount);
        } else {
            MultichainUtils.transferOut(dataStore, eventEmitter, multichainVault, token, account, receiver, amount, srcChainId);
        }
    }

    function _transferResidualFee(address wnt, address residualFeeReceiver, uint256 residualFee, address account, uint256 srcChainId) internal override {
        TokenUtils.transfer(dataStore, wnt, residualFeeReceiver, residualFee);
        if (residualFeeReceiver == address(multichainVault)) {
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, wnt, account, srcChainId);
        }
    }

    function _validateDesChainId(uint256 desChainId) internal view {
        if (desChainId != block.chainid) {
            revert Errors.InvalidDestinationChainId();
        }
    }
}
