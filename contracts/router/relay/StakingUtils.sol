// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IRelayUtils.sol";

library StakingUtils {
    bytes32 public constant STAKE_GMX_TYPEHASH =
        keccak256(bytes("StakeGmx(uint256 amount,bytes32 relayParams)"));
    bytes32 public constant UNSTAKE_GMX_TYPEHASH =
        keccak256(bytes("UnstakeGmx(uint256 amount,bytes32 relayParams)"));
    bytes32 public constant STAKE_ES_GMX_TYPEHASH =
        keccak256(bytes("StakeEsGmx(uint256 amount,bytes32 relayParams)"));
    bytes32 public constant UNSTAKE_ES_GMX_TYPEHASH =
        keccak256(bytes("UnstakeEsGmx(uint256 amount,bytes32 relayParams)"));
    bytes32 public constant HANDLE_STAKING_REWARDS_TYPEHASH =
        keccak256(bytes("HandleStakingRewards(bool shouldClaimGmx,bool shouldStakeGmx,bool shouldClaimEsGmx,bool shouldStakeEsGmx,bool shouldStakeMultiplierPoints,bool shouldClaimWeth,bytes32 relayParams)"));
    bytes32 public constant COMPOUND_STAKING_REWARDS_TYPEHASH =
        keccak256(bytes("CompoundStakingRewards(bytes32 relayParams)"));
    bytes32 public constant VEST_ES_GMX_TYPEHASH =
        keccak256(bytes("VestEsGmx(uint256 amount,bytes32 relayParams)"));
    bytes32 public constant DELEGATE_GOV_GMX_TYPEHASH =
        keccak256(bytes("DelegateGovGmx(address delegatee,bytes32 relayParams)"));
    bytes32 public constant SIGNAL_STAKING_TRANSFER_TYPEHASH =
        keccak256(bytes("SignalStakingTransfer(address receiver,bytes32 relayParams)"));
    bytes32 public constant ACCEPT_STAKING_TRANSFER_TYPEHASH =
        keccak256(bytes("AcceptStakingTransfer(address sender,bytes32 relayParams)"));
    bytes32 public constant WITHDRAW_FROM_WALLET_TYPEHASH =
        keccak256(bytes("WithdrawFromWallet(address token,uint256 amount,bytes32 relayParams)"));

    function getStakeGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(STAKE_GMX_TYPEHASH, amount, _getRelayParamsHash(relayParams)));
    }

    function getUnstakeGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(UNSTAKE_GMX_TYPEHASH, amount, _getRelayParamsHash(relayParams)));
    }

    function getStakeEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(STAKE_ES_GMX_TYPEHASH, amount, _getRelayParamsHash(relayParams)));
    }

    function getUnstakeEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(UNSTAKE_ES_GMX_TYPEHASH, amount, _getRelayParamsHash(relayParams)));
    }

    function getHandleStakingRewardsStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(
            HANDLE_STAKING_REWARDS_TYPEHASH,
            params.shouldClaimGmx,
            params.shouldStakeGmx,
            params.shouldClaimEsGmx,
            params.shouldStakeEsGmx,
            params.shouldStakeMultiplierPoints,
            params.shouldClaimWeth,
            _getRelayParamsHash(relayParams)
        ));
    }

    function getCompoundStakingRewardsStructHash(
        IRelayUtils.RelayParams calldata relayParams
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(COMPOUND_STAKING_REWARDS_TYPEHASH, _getRelayParamsHash(relayParams)));
    }

    function getVestEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(VEST_ES_GMX_TYPEHASH, amount, _getRelayParamsHash(relayParams)));
    }

    function getDelegateGovGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address delegatee
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(DELEGATE_GOV_GMX_TYPEHASH, delegatee, _getRelayParamsHash(relayParams)));
    }

    function getSignalStakingTransferStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address receiver
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(SIGNAL_STAKING_TRANSFER_TYPEHASH, receiver, _getRelayParamsHash(relayParams)));
    }

    function getAcceptStakingTransferStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address sender
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(ACCEPT_STAKING_TRANSFER_TYPEHASH, sender, _getRelayParamsHash(relayParams)));
    }

    function getWithdrawFromWalletStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address token,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(WITHDRAW_FROM_WALLET_TYPEHASH, token, amount, _getRelayParamsHash(relayParams)));
    }

    function _getRelayParamsHash(IRelayUtils.RelayParams calldata relayParams) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    relayParams.oracleParams,
                    relayParams.externalCalls,
                    relayParams.tokenPermits,
                    relayParams.fee,
                    relayParams.userNonce,
                    relayParams.deadline,
                    relayParams.desChainId
                )
            );
    }
}
