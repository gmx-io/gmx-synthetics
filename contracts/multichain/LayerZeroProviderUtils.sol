// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../error/ErrorUtils.sol";
import "../gas/GasUtils.sol";
import "../glv/GlvUtils.sol";
import "../router/relay/IRelayUtils.sol";

import "./IMultichainProvider.sol";
import "./IMultichainGmRouter.sol";
import "./IMultichainGlvRouter.sol";
import "./IMultichainOrderRouter.sol";
import "./MultichainEventUtils.sol";

library LayerZeroProviderUtils {
    struct DispatchContracts {
        IMultichainGmRouter multichainGmRouter;
        IMultichainGlvRouter multichainGlvRouter;
        IMultichainOrderRouter multichainOrderRouter;
        DataStore dataStore;
        EventEmitter eventEmitter;
    }

    /// @return false if the router call reverted
    function dispatchAction(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) external returns (bool) {
        if (actionType == IMultichainProvider.ActionType.Deposit) {
            return _handleDeposit(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.GlvDeposit) {
            return _handleGlvDeposit(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.SetTraderReferralCode) {
            return _handleSetTraderReferralCode(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.RegisterCode) {
            return _handleRegisterCode(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.Withdrawal) {
            return _handleWithdrawal(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.GlvWithdrawal) {
            return _handleGlvWithdrawal(contracts, account, srcChainId, actionType, actionData);
        }
        // no actionType logic was run, true here only means that nothing failed
        // this is the case for ActionType.None (a bridge-in without an action) and BridgeOut
        return true;
    }

    // GM/GLV handlers

    function _handleDeposit(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IDepositUtils.CreateDepositParams memory depositParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IDepositUtils.CreateDepositParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateDepositGasLimit(contracts.dataStore);
            _validateGasLeft(estimatedGasLimit);

            try contracts.multichainGmRouter.createDeposit(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                depositParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            }
        }
        return true;
    }

    function _handleGlvDeposit(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IGlvDepositUtils.CreateGlvDepositParams memory glvDepositParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IGlvDepositUtils.CreateGlvDepositParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateGlvDepositGasLimit(contracts.dataStore);
            _validateGasLeft(estimatedGasLimit);

            try contracts.multichainGlvRouter.createGlvDeposit(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                glvDepositParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            }
        }
        return true;
    }

    function _handleWithdrawal(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IWithdrawalUtils.CreateWithdrawalParams memory withdrawalParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IWithdrawalUtils.CreateWithdrawalParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateWithdrawalGasLimit(contracts.dataStore);
            _validateGasLeft(estimatedGasLimit);

            try contracts.multichainGmRouter.createWithdrawal(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                withdrawalParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            }
        }
        return true;
    }

    function _handleGlvWithdrawal(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory glvWithdrawalParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IGlvWithdrawalUtils.CreateGlvWithdrawalParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateGlvWithdrawalGasLimit(contracts.dataStore);
            _validateGasLeft(estimatedGasLimit);

            try contracts.multichainGlvRouter.createGlvWithdrawal(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                glvWithdrawalParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
                return false;
            }
        }
        return true;
    }

    // Referral handlers

    function _handleSetTraderReferralCode(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateSetTraderReferralCodeGasLimit(contracts.dataStore);
        _validateGasLeft(estimatedGasLimit);

        try contracts.multichainOrderRouter.setTraderReferralCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            return false;
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            return false;
        }
        return true;
    }

    function _handleRegisterCode(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private returns (bool) {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateRegisterCodeGasLimit(contracts.dataStore);
        _validateGasLeft(estimatedGasLimit);

        try contracts.multichainOrderRouter.registerCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            return false;
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            return false;
        }
        return true;
    }

    // Helpers

    function _areValidTransferRequests(IRelayUtils.TransferRequests memory transferRequests) private pure returns (bool) {
        if (
            transferRequests.tokens.length != transferRequests.receivers.length ||
            transferRequests.tokens.length != transferRequests.amounts.length
        ) {
            return false;
        }
        for (uint256 i = 0; i < transferRequests.tokens.length; i++) {
            if (
                transferRequests.tokens[i] == address(0) ||
                transferRequests.receivers[i] == address(0) ||
                transferRequests.amounts[i] == 0
            ) {
                return false;
            }
        }
        return true;
    }

    function _validateGasLeft(uint256 estimatedGasLimit) private view {
        uint256 gas = gasleft();
        if (gas < estimatedGasLimit) {
            revert Errors.InsufficientGasLeft(gas, estimatedGasLimit);
        }
    }
}
