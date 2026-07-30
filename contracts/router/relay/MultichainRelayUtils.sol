// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../deposit/IDepositUtils.sol";
import "../../glv/glvDeposit/IGlvDepositUtils.sol";
import "../../withdrawal/IWithdrawalUtils.sol";
import "../../glv/glvWithdrawal/IGlvWithdrawalUtils.sol";
import "../../shift/IShiftUtils.sol";

import "./IRelayUtils.sol";

library MultichainRelayUtils {
    bytes32 public constant SET_TRADER_REFERRAL_CODE_TYPEHASH =
        keccak256(bytes("SetTraderReferralCode(address account,bytes32 referralCode,bytes32 relayParams)"));

    bytes32 public constant REGISTER_CODE_TYPEHASH =
        keccak256(bytes("RegisterCode(address account,bytes32 referralCode,bytes32 relayParams)"));

    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(address account,TransferRequests transferRequests,CreateDepositAddresses addresses,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateDepositAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_WITHDRAWAL_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawal(address account,TransferRequests transferRequests,CreateWithdrawalAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath)TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"
            )
        );
    bytes32 public constant CREATE_WITHDRAWAL_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_SHIFT_TYPEHASH =
        keccak256(
            bytes(
                "CreateShift(address account,TransferRequests transferRequests,CreateShiftAddresses addresses,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateShiftAddresses(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket)TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"
            )
        );
    bytes32 public constant CREATE_SHIFT_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateShiftAddresses(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket)"
            )
        );

    bytes32 public constant CREATE_GLV_DEPOSIT_TYPEHASH =
        keccak256(
            "CreateGlvDeposit(address account,TransferRequests transferRequests,CreateGlvDepositAddresses addresses,uint256 minGlvTokens,uint256 executionFee,uint256 callbackGasLimit,bool shouldUnwrapNativeToken,bool isMarketTokenDeposit,bytes32[] dataList,bytes32 relayParams)CreateGlvDepositAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"
        );
    bytes32 public constant CREATE_GLV_DEPOSIT_ADDRESSES_TYPEHASH =
        keccak256(
            "CreateGlvDepositAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );

    bytes32 public constant CREATE_GLV_WITHDRAWAL_TYPEHASH =
        keccak256(
            "CreateGlvWithdrawal(address account,TransferRequests transferRequests,CreateGlvWithdrawalAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateGlvWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"
        );
    bytes32 public constant CREATE_GLV_WITHDRAWAL_ADDRESSES_TYPEHASH =
        keccak256(
            "CreateGlvWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );

    bytes32 public constant TRANSFER_REQUESTS_TYPEHASH =
        keccak256(bytes("TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"));

    bytes32 public constant BRIDGE_OUT_TYPEHASH =
        keccak256(bytes("BridgeOut(address account,address token,uint256 amount,uint256 minAmountOut,address provider,bytes data,address bridgeFeeToken,uint256 bridgeFeeAmount,address[] bridgeFeeSwapPath,uint256 bridgeFeeMinOutputAmount,bytes32 relayParams)"));

    bytes32 public constant CLAIM_FUNDING_FEES_TYPEHASH =
        keccak256(bytes("ClaimFundingFees(address account,address[] markets,address[] tokens,address receiver,bytes32 relayParams)"));
    bytes32 public constant CLAIM_COLLATERAL_TYPEHASH =
        keccak256(
            bytes(
                "ClaimCollateral(address account,address[] markets,address[] tokens,uint256[] timeKeys,address receiver,bytes32 relayParams)"
            )
        );
    bytes32 public constant CLAIM_AFFILIATE_REWARDS_TYPEHASH =
        keccak256(
            bytes("ClaimAffiliateRewards(address account,address[] markets,address[] tokens,address receiver,bytes32 relayParams)")
        );

    function getTraderReferralCodeStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        bytes32 referralCode
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SET_TRADER_REFERRAL_CODE_TYPEHASH,
                    account,
                    referralCode,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getRegisterCodeStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        bytes32 referralCode
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REGISTER_CODE_TYPEHASH,
                    account,
                    referralCode,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getClaimFundingFeesStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_FUNDING_FEES_TYPEHASH,
                    account,
                    keccak256(abi.encodePacked(markets)),
                    keccak256(abi.encodePacked(tokens)),
                    receiver,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getClaimCollateralStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_COLLATERAL_TYPEHASH,
                    account,
                    keccak256(abi.encodePacked(markets)),
                    keccak256(abi.encodePacked(tokens)),
                    keccak256(abi.encodePacked(timeKeys)),
                    receiver,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getClaimAffiliateRewardsStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_AFFILIATE_REWARDS_TYPEHASH,
                    account,
                    keccak256(abi.encodePacked(markets)),
                    keccak256(abi.encodePacked(tokens)),
                    receiver,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateDepositStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        IDepositUtils.CreateDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    account,
                    _getTransferRequestsStructHash(transferRequests),
                    _getCreateDepositAdressesStructHash(params.addresses),
                    params.minMarketTokens,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateGlvDepositStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_TYPEHASH,
                    account,
                    _getTransferRequestsStructHash(transferRequests),
                    _getCreateGlvDepositAddressesStructHash(params.addresses),
                    params.minGlvTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    params.shouldUnwrapNativeToken,
                    params.isMarketTokenDeposit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateWithdrawalStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        IWithdrawalUtils.CreateWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_TYPEHASH,
                    account,
                    _getTransferRequestsStructHash(transferRequests),
                    _getCreateWithdrawalAddressesStructHash(params.addresses),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateShiftStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        IShiftUtils.CreateShiftParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SHIFT_TYPEHASH,
                    account,
                    _getTransferRequestsStructHash(transferRequests),
                    _getCreateShiftAddressesStructHash(params.addresses),
                    params.minMarketTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateGlvWithdrawalStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_TYPEHASH,
                    account,
                    _getTransferRequestsStructHash(transferRequests),
                    _getCreateGlvWithdrawalAddressesStructHash(params.addresses),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getBridgeOutStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.BridgeOutParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_OUT_TYPEHASH,
                    account,
                    params.token,
                    params.amount,
                    params.minAmountOut,
                    params.provider,
                    keccak256(abi.encodePacked(params.data)),
                    params.bridgeFee.feeToken,
                    params.bridgeFee.feeAmount,
                    keccak256(abi.encodePacked(params.bridgeFee.feeSwapPath)),
                    params.bridgeFee.minOutputAmount,
                    _getRelayParamsHash(relayParams)
                )
            );
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

    function _getTransferRequestsStructHash(
        IRelayUtils.TransferRequests calldata transferRequests
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    TRANSFER_REQUESTS_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts))
                )
            );
    }

    function _getCreateDepositAdressesStructHash(
        IDepositUtils.CreateDepositParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    addresses.initialLongToken,
                    addresses.initialShortToken,
                    keccak256(abi.encodePacked(addresses.longTokenSwapPath)),
                    keccak256(abi.encodePacked(addresses.shortTokenSwapPath))
                )
            );
    }

    function _getCreateGlvDepositAddressesStructHash(
        IGlvDepositUtils.CreateGlvDepositParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_ADDRESSES_TYPEHASH,
                    addresses.glv,
                    addresses.market,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.initialLongToken,
                    addresses.initialShortToken,
                    keccak256(abi.encodePacked(addresses.longTokenSwapPath)),
                    keccak256(abi.encodePacked(addresses.shortTokenSwapPath))
                )
            );
    }

    function _getCreateWithdrawalAddressesStructHash(
        IWithdrawalUtils.CreateWithdrawalParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    keccak256(abi.encodePacked(addresses.longTokenSwapPath)),
                    keccak256(abi.encodePacked(addresses.shortTokenSwapPath))
                )
            );
    }

    function _getCreateShiftAddressesStructHash(
        IShiftUtils.CreateShiftParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SHIFT_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.fromMarket,
                    addresses.toMarket
                )
            );
    }

    function _getCreateGlvWithdrawalAddressesStructHash(
        IGlvWithdrawalUtils.CreateGlvWithdrawalParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    addresses.glv,
                    keccak256(abi.encodePacked(addresses.longTokenSwapPath)),
                    keccak256(abi.encodePacked(addresses.shortTokenSwapPath))
                )
            );
    }
}
