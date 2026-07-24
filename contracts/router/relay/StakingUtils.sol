// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IRelayUtils.sol";

library StakingUtils {
    bytes32 public constant STAKE_GMX_TYPEHASH =
        keccak256(bytes("StakeGmx(address account,uint256 amount,bytes32 relayParams)"));
    bytes32 public constant UNSTAKE_GMX_TYPEHASH =
        keccak256(bytes("UnstakeGmx(address account,uint256 amount,bytes32 relayParams)"));
    bytes32 public constant STAKE_ES_GMX_TYPEHASH =
        keccak256(bytes("StakeEsGmx(address account,uint256 amount,bytes32 relayParams)"));
    bytes32 public constant UNSTAKE_ES_GMX_TYPEHASH =
        keccak256(bytes("UnstakeEsGmx(address account,uint256 amount,bytes32 relayParams)"));
    bytes32 public constant HANDLE_STAKING_REWARDS_TYPEHASH =
        keccak256(bytes("HandleStakingRewards(address account,bool shouldClaimGmx,bool shouldStakeGmx,bool shouldClaimEsGmx,bool shouldStakeEsGmx,bool shouldStakeMultiplierPoints,bool shouldClaimWeth,bytes32 relayParams)"));
    bytes32 public constant COMPOUND_STAKING_REWARDS_TYPEHASH =
        keccak256(bytes("CompoundStakingRewards(address account,bytes32 relayParams)"));
    bytes32 public constant VEST_ES_GMX_TYPEHASH =
        keccak256(bytes("VestEsGmx(address account,uint256 amount,bytes32 relayParams)"));
    bytes32 public constant WITHDRAW_VESTING_TYPEHASH =
        keccak256(bytes("WithdrawVesting(address account,bytes32 relayParams)"));
    bytes32 public constant DELEGATE_GOV_GMX_TYPEHASH =
        keccak256(bytes("DelegateGovGmx(address account,address delegatee,bytes32 relayParams)"));
    bytes32 public constant SIGNAL_STAKING_TRANSFER_TYPEHASH =
        keccak256(bytes("SignalStakingTransfer(address account,address receiver,bytes32 relayParams)"));
    bytes32 public constant ACCEPT_STAKING_TRANSFER_TYPEHASH =
        keccak256(bytes("AcceptStakingTransfer(address account,address sender,bytes32 relayParams)"));
    bytes32 public constant WITHDRAW_FROM_WALLET_TYPEHASH =
        keccak256(bytes("WithdrawFromWallet(address account,address token,uint256 amount,bytes32 relayParams)"));

    function getStakeGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(STAKE_GMX_TYPEHASH, account, amount, _getRelayParamsHash(relayParams)));
    }

    function getUnstakeGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(UNSTAKE_GMX_TYPEHASH, account, amount, _getRelayParamsHash(relayParams)));
    }

    function getStakeEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(STAKE_ES_GMX_TYPEHASH, account, amount, _getRelayParamsHash(relayParams)));
    }

    function getUnstakeEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(UNSTAKE_ES_GMX_TYPEHASH, account, amount, _getRelayParamsHash(relayParams)));
    }

    function getHandleStakingRewardsStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(
            HANDLE_STAKING_REWARDS_TYPEHASH,
            account,
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
        IRelayUtils.RelayParams calldata relayParams,
        address account
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(COMPOUND_STAKING_REWARDS_TYPEHASH, account, _getRelayParamsHash(relayParams)));
    }

    function getVestEsGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(VEST_ES_GMX_TYPEHASH, account, amount, _getRelayParamsHash(relayParams)));
    }

    function getWithdrawVestingStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(WITHDRAW_VESTING_TYPEHASH, account, _getRelayParamsHash(relayParams)));
    }

    function getDelegateGovGmxStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address delegatee
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(DELEGATE_GOV_GMX_TYPEHASH, account, delegatee, _getRelayParamsHash(relayParams)));
    }

    function getSignalStakingTransferStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address receiver
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(SIGNAL_STAKING_TRANSFER_TYPEHASH, account, receiver, _getRelayParamsHash(relayParams)));
    }

    function getAcceptStakingTransferStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address sender
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(ACCEPT_STAKING_TRANSFER_TYPEHASH, account, sender, _getRelayParamsHash(relayParams)));
    }

    function getWithdrawFromWalletStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address token,
        uint256 amount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(WITHDRAW_FROM_WALLET_TYPEHASH, account, token, amount, _getRelayParamsHash(relayParams)));
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
                    relayParams.desChainId,
                    relayParams.eip6492SignatureWrapperHash
                )
            );
    }
}
