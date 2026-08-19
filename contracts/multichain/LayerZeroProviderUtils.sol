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
import "./IMultichainStakingRouter.sol";
import "./MultichainEventUtils.sol";

library LayerZeroProviderUtils {
    struct DispatchContracts {
        IMultichainGmRouter multichainGmRouter;
        IMultichainGlvRouter multichainGlvRouter;
        IMultichainOrderRouter multichainOrderRouter;
        IMultichainStakingRouter multichainStakingRouter;
        DataStore dataStore;
        EventEmitter eventEmitter;
    }

    function dispatchAction(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) external {
        if (actionType == IMultichainProvider.ActionType.Deposit) {
            _handleDeposit(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.GlvDeposit) {
            _handleGlvDeposit(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.SetTraderReferralCode) {
            _handleSetTraderReferralCode(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.RegisterCode) {
            _handleRegisterCode(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.Withdrawal) {
            _handleWithdrawal(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.GlvWithdrawal) {
            _handleGlvWithdrawal(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.StakeGmx) {
            _handleStakeGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.UnstakeGmx) {
            _handleUnstakeGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.StakeEsGmx) {
            _handleStakeEsGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.UnstakeEsGmx) {
            _handleUnstakeEsGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.HandleStakingRewards) {
            _handleHandleStakingRewards(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.CompoundStakingRewards) {
            _handleCompoundStakingRewards(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.VestEsGmx) {
            _handleVestEsGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.DelegateGovGmx) {
            _handleDelegateGovGmx(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.SignalStakingTransfer) {
            _handleSignalStakingTransfer(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.AcceptStakingTransfer) {
            _handleAcceptStakingTransfer(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.WithdrawFromWallet) {
            _handleWithdrawFromWallet(contracts, account, srcChainId, actionType, actionData);
        } else if (actionType == IMultichainProvider.ActionType.WithdrawVesting) {
            _handleWithdrawVesting(contracts, account, srcChainId, actionType, actionData);
        }
    }

    // GM/GLV handlers

    function _handleDeposit(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
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
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    function _handleGlvDeposit(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
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
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    function _handleWithdrawal(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
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
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    function _handleGlvWithdrawal(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
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
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    // Referral handlers

    function _handleSetTraderReferralCode(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateSetTraderReferralCodeGasLimit(contracts.dataStore);
        _validateGasLeft(estimatedGasLimit);

        try contracts.multichainOrderRouter.setTraderReferralCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleRegisterCode(
        DispatchContracts memory contracts,
        address account,
        uint256 srcChainId,
        IMultichainProvider.ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateRegisterCodeGasLimit(contracts.dataStore);
        _validateGasLeft(estimatedGasLimit);

        try contracts.multichainOrderRouter.registerCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    // Staking handlers

    function _handleStakeGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.STAKE_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.stakeGmx(relayParams, account, srcChainId, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleUnstakeGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.UNSTAKE_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.unstakeGmx(relayParams, account, srcChainId, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleStakeEsGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.STAKE_ES_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.stakeEsGmx(relayParams, account, srcChainId, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleUnstakeEsGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.UNSTAKE_ES_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.unstakeEsGmx(relayParams, account, srcChainId, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleHandleStakingRewards(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, IRelayUtils.HandleStakingRewardsParams memory params) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.HandleStakingRewardsParams));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.HANDLE_STAKING_REWARDS_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.handleStakingRewards(relayParams, account, srcChainId, params) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleCompoundStakingRewards(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        IRelayUtils.RelayParams memory relayParams = abi.decode(actionData, (IRelayUtils.RelayParams));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.COMPOUND_STAKING_REWARDS_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.compoundStakingRewards(relayParams, account, srcChainId) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleVestEsGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.VEST_ES_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.vestEsGmx(relayParams, account, srcChainId, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleDelegateGovGmx(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, address delegatee) = abi.decode(actionData, (IRelayUtils.RelayParams, address));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.DELEGATE_GOV_GMX_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.delegateGovGmx(relayParams, account, srcChainId, delegatee) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleSignalStakingTransfer(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, address receiver) = abi.decode(actionData, (IRelayUtils.RelayParams, address));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.SIGNAL_STAKING_TRANSFER_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.signalStakingTransfer(relayParams, account, srcChainId, receiver) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleAcceptStakingTransfer(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, address sender) = abi.decode(actionData, (IRelayUtils.RelayParams, address));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.ACCEPT_STAKING_TRANSFER_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.acceptStakingTransfer(relayParams, account, srcChainId, sender) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleWithdrawFromWallet(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        (IRelayUtils.RelayParams memory relayParams, address token, uint256 amount) = abi.decode(actionData, (IRelayUtils.RelayParams, address, uint256));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys2.WITHDRAW_FROM_WALLET_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.withdrawFromWallet(relayParams, account, srcChainId, token, amount) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleWithdrawVesting(DispatchContracts memory contracts, address account, uint256 srcChainId, IMultichainProvider.ActionType actionType, bytes memory actionData) private {
        IRelayUtils.RelayParams memory relayParams = abi.decode(actionData, (IRelayUtils.RelayParams));
        uint256 estimatedGasLimit = GasUtils.estimateStakingActionGasLimit(contracts.dataStore, Keys.WITHDRAW_VESTING_GAS_LIMIT);
        _validateGasLeft(estimatedGasLimit);
        try contracts.multichainStakingRouter.withdrawVesting(relayParams, account, srcChainId) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, ) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(contracts.eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
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
