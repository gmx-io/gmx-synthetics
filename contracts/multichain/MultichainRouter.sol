// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/BaseGelatoRelayRouter.sol";

import "./MultichainUtils.sol";

abstract contract MultichainRouter is BaseGelatoRelayRouter {
    struct BaseConstructorParams {
        Router router;
        RoleStore roleStore;
        DataStore dataStore;
        EventEmitter eventEmitter;
        IOracle oracle;
        OrderVault orderVault;
        IOrderHandler orderHandler;
        ISwapHandler swapHandler;
        IExternalHandler externalHandler;
        MultichainVault multichainVault;
    }

    MultichainVault public immutable multichainVault;

    constructor(
        BaseConstructorParams memory params
    ) BaseGelatoRelayRouter(params.oracle, params.orderHandler, params.orderVault, params.swapHandler, params.externalHandler) {
        multichainVault = params.multichainVault;
    }

    function _processTransferRequests(
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        uint256 srcChainId
    ) internal {
        if (
            transferRequests.tokens.length != transferRequests.receivers.length ||
            transferRequests.tokens.length != transferRequests.amounts.length
        ) {
            revert Errors.InvalidTransferRequestsLength();
        }

        for (uint256 i = 0; i < transferRequests.tokens.length; i++) {
            _sendTokens(
                account,
                transferRequests.tokens[i],
                transferRequests.receivers[i],
                transferRequests.amounts[i],
                srcChainId
            );
        }
    }

    function _isMultichain() internal pure override returns (bool) {
        return true;
    }

    function _sendTokens(
        address account,
        address token,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) internal override {
        AccountUtils.validateReceiver(receiver);
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            token,
            account,
            receiver,
            amount,
            srcChainId
        );
    }

    function _transferResidualFee(
        address wnt,
        address account,
        uint256 residualFee,
        uint256 srcChainId
    ) internal override {
        TokenUtils.transfer(dataStore, wnt, address(multichainVault), residualFee);
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, wnt, account, srcChainId);
    }

    function _recordRefundedAmounts(
        address account,
        uint256 srcChainId,
        address[] calldata refundTokens,
        address[] calldata refundReceivers
    ) internal override {
        // equality length for refundTokens and refundReceivers is validated in the external handler
        for (uint256 i; i < refundReceivers.length; i++) {
            if (refundReceivers[i] == address(multichainVault)) {
                MultichainUtils.recordTransferIn(
                    dataStore,
                    eventEmitter,
                    multichainVault,
                    refundTokens[i],
                    account,
                    srcChainId
                );
            }
        }
    }
}
