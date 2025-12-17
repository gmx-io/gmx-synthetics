// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../order/OrderVault.sol";
import "../../oracle/IOracle.sol";
import "../../oracle/OracleUtils.sol";
import "../../market/MarketUtils.sol";
import "../../swap/ISwapUtils.sol";
import { SubaccountApproval } from "../../subaccount/SubaccountUtils.sol";

import "../../deposit/IDepositUtils.sol";
import "../../glv/glvDeposit/IGlvDepositUtils.sol";
import "../../withdrawal/IWithdrawalUtils.sol";
import "../../glv/glvWithdrawal/IGlvWithdrawalUtils.sol";
import "../../shift/IShiftUtils.sol";
import "../../swap/ISwapHandler.sol";

import "./IRelayUtils.sol";

struct Contracts {
    DataStore dataStore;
    OrderVault orderVault;
    ISwapHandler swapHandler;
    address wnt;
}

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";

string constant CREATE_ORDER_PARAMS_ROOT = "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList)";
string constant CREATE_ORDER_PARAMS = string(
    abi.encodePacked(
        "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS
    )
);

library RelayUtils {
    bytes32 public constant UPDATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(UPDATE_ORDER_PARAMS));
    bytes32 public constant UPDATE_ORDER_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "UpdateOrder(address account,UpdateOrderParams params,bytes32 relayParams,bytes32 subaccountApproval)",
                UPDATE_ORDER_PARAMS
            )
        );

    bytes32 public constant CANCEL_ORDER_TYPEHASH =
        keccak256(bytes("CancelOrder(address account,bytes32 key,bytes32 relayParams,bytes32 subaccountApproval)"));

    bytes32 public constant CREATE_ORDER_NUMBERS_TYPEHASH = keccak256(bytes(CREATE_ORDER_NUMBERS));
    bytes32 public constant CREATE_ORDER_ADDRESSES_TYPEHASH = keccak256(bytes(CREATE_ORDER_ADDRESSES));
    bytes32 public constant CREATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(CREATE_ORDER_PARAMS));
    bytes32 public constant CREATE_ORDER_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "CreateOrder(address account,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList,bytes32 relayParams,bytes32 subaccountApproval)",
                CREATE_ORDER_ADDRESSES,
                CREATE_ORDER_NUMBERS
            )
        );

    bytes32 public constant SUBACCOUNT_APPROVAL_TYPEHASH =
        keccak256(
            bytes(
                "SubaccountApproval(address subaccount,bool shouldAdd,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 desChainId,uint256 deadline,bytes32 integrationId)"
            )
        );

    bytes32 public constant MINIFIED_TYPEHASH = keccak256(bytes("Minified(bytes32 digest)"));

    bytes32 public constant REMOVE_SUBACCOUNT_TYPEHASH =
        keccak256(bytes("RemoveSubaccount(address subaccount,bytes32 relayParams)"));

    bytes32 public constant BATCH_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Batch(address account,CreateOrderParams[] createOrderParamsList,UpdateOrderParams[] updateOrderParamsList,bytes32[] cancelOrderKeys,bytes32 relayParams,bytes32 subaccountApproval)",
                // according to EIP-712 all types following the root type should be in alphabetical order
                // can't use CREATE_ORDER_PARAMS because the resulting order would be incorrect: CreateOrderParams, CreateOrderAddresses, CreateOrderNumbers
                // it should be CreateOrderAddresses, CreateOrderNumbers, CreateOrderParams
                CREATE_ORDER_ADDRESSES,
                CREATE_ORDER_NUMBERS,
                CREATE_ORDER_PARAMS_ROOT,
                UPDATE_ORDER_PARAMS
            )
        );

    // Multichain
    bytes32 public constant SET_TRADER_REFERRAL_CODE_TYPEHASH =
        keccak256(bytes("SetTraderReferralCode(bytes32 referralCode,bytes32 relayParams)"));

    bytes32 public constant REGISTER_CODE_TYPEHASH =
        keccak256(bytes("RegisterCode(bytes32 referralCode,bytes32 relayParams)"));

    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(address[] transferTokens,address[] transferReceivers,uint256[] transferAmounts,CreateDepositAddresses addresses,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateDepositAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
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
                "CreateWithdrawal(address[] transferTokens,address[] transferReceivers,uint256[] transferAmounts,CreateWithdrawalAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
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
                "CreateShift(address[] transferTokens,address[] transferReceivers,uint256[] transferAmounts,CreateShiftAddresses addresses,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateShiftAddresses(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket)"
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
            "CreateGlvDeposit(address[] transferTokens,address[] transferReceivers,uint256[] transferAmounts,CreateGlvDepositAddresses addresses,uint256 minGlvTokens,uint256 executionFee,uint256 callbackGasLimit,bool shouldUnwrapNativeToken,bool isMarketTokenDeposit,bytes32[] dataList,bytes32 relayParams)CreateGlvDepositAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );
    bytes32 public constant CREATE_GLV_DEPOSIT_ADDRESSES_TYPEHASH =
        keccak256(
            "CreateGlvDepositAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );

    bytes32 public constant CREATE_GLV_WITHDRAWAL_TYPEHASH =
        keccak256(
            "CreateGlvWithdrawal(address[] transferTokens,address[] transferReceivers,uint256[] transferAmounts,CreateGlvWithdrawalAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,bytes32[] dataList,bytes32 relayParams)CreateGlvWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );
    bytes32 public constant CREATE_GLV_WITHDRAWAL_ADDRESSES_TYPEHASH =
        keccak256(
            "CreateGlvWithdrawalAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
        );

    bytes32 public constant TRANSFER_REQUESTS_TYPEHASH =
        keccak256(bytes("TransferRequests(address[] tokens,address[] receivers,uint256[] amounts)"));

    bytes32 public constant BRIDGE_OUT_TYPEHASH =
        keccak256(bytes("BridgeOut(address token,uint256 amount,uint256 minAmountOut,address provider,bytes data,bytes32 relayParams)"));

    bytes32 public constant CLAIM_FUNDING_FEES_TYPEHASH =
        keccak256(bytes("ClaimFundingFees(address[] markets,address[] tokens,address receiver,bytes32 relayParams)"));
    bytes32 public constant CLAIM_COLLATERAL_TYPEHASH =
        keccak256(
            bytes(
                "ClaimCollateral(address[] markets,address[] tokens,uint256[] timeKeys,address receiver,bytes32 relayParams)"
            )
        );
    bytes32 public constant CLAIM_AFFILIATE_REWARDS_TYPEHASH =
        keccak256(
            bytes("ClaimAffiliateRewards(address[] markets,address[] tokens,address receiver,bytes32 relayParams)")
        );

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
    bytes32 public constant DOMAIN_SEPARATOR_NAME_HASH = keccak256(bytes("GmxBaseGelatoRelayRouter"));
    bytes32 public constant DOMAIN_SEPARATOR_VERSION_HASH = keccak256(bytes("1"));

    address constant GMX_SIMULATION_ORIGIN = address(uint160(uint256(keccak256("GMX SIMULATION ORIGIN"))));


    function getDomainSeparator(uint256 sourceChainId) external view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    DOMAIN_SEPARATOR_NAME_HASH,
                    DOMAIN_SEPARATOR_VERSION_HASH,
                    sourceChainId,
                    address(this)
                )
            );
    }

    function validateSignature(
        bytes32 domainSeparator,
        bytes32 digest,
        bytes calldata signature,
        address expectedSigner,
        string memory signatureType
    ) external view {
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);

        // allow to optionally skip signature validation for eth_estimateGas / eth_call if tx.origin is GMX_SIMULATION_ORIGIN
        // do not use address(0) to avoid relays accidentally skipping signature validation if they use address(0) as the origin
        if (tx.origin == GMX_SIMULATION_ORIGIN) {
            return;
        }

        if (error != ECDSA.RecoverError.NoError) {
            revert Errors.InvalidSignature(signatureType);
        }

        // for some cases, e.g. ledger, signing does not work because the payload
        // is too large
        // for these cases, the user can sign a minified structHash instead
        // the user should be shown the source data that was used to construct
        // the minified structHash so that they can verify it independently
        if (recovered != expectedSigner) {
            bytes32 minifiedStructHash = keccak256(
                abi.encode(
                    MINIFIED_TYPEHASH,
                    digest
                )
            );

            // since digest is already validated in BaseGelatoRelayRouter,
            // we do not call _validateDigest on minifiedDigest
            bytes32 minifiedDigest = ECDSA.toTypedDataHash(domainSeparator, minifiedStructHash);

            (address recoveredFromMinified, ECDSA.RecoverError errorFromMinified) = ECDSA.tryRecover(minifiedDigest, signature);

            if (errorFromMinified != ECDSA.RecoverError.NoError) {
                revert Errors.InvalidSignature(signatureType);
            }

            if (recoveredFromMinified != expectedSigner) {
                revert Errors.InvalidRecoveredSigner(signatureType, recovered, recoveredFromMinified, expectedSigner);
            }
        }
    }

    function swapFeeTokens(
        Contracts memory contracts,
        EventEmitter eventEmitter,
        IOracle oracle,
        IRelayUtils.FeeParams calldata fee
    ) external {
        // swap fee tokens to WNT
        MarketUtils.validateSwapPath(contracts.dataStore, fee.feeSwapPath);
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(contracts.dataStore, fee.feeSwapPath);

        (address outputToken, ) = contracts.swapHandler.swap(
            ISwapUtils.SwapParams({
                dataStore: contracts.dataStore,
                eventEmitter: eventEmitter,
                oracle: oracle,
                bank: contracts.orderVault,
                key: bytes32(0),
                tokenIn: fee.feeToken,
                amountIn: fee.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: 0,
                receiver: address(this),
                uiFeeReceiver: address(0),
                shouldUnwrapNativeToken: false,
                swapPricingType: ISwapPricingUtils.SwapPricingType.AtomicSwap
            })
        );

        if (outputToken != contracts.wnt) {
            revert Errors.UnexpectedRelayFeeTokenAfterSwap(outputToken, contracts.wnt);
        }
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

    function getRemoveSubaccountStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address subaccount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(REMOVE_SUBACCOUNT_TYPEHASH, subaccount, _getRelayParamsHash(relayParams)));
    }

    function getSubaccountApprovalStructHash(
        SubaccountApproval calldata subaccountApproval
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SUBACCOUNT_APPROVAL_TYPEHASH,
                    subaccountApproval.subaccount,
                    subaccountApproval.shouldAdd,
                    subaccountApproval.expiresAt,
                    subaccountApproval.maxAllowedCount,
                    subaccountApproval.actionType,
                    subaccountApproval.nonce,
                    subaccountApproval.desChainId,
                    subaccountApproval.deadline,
                    subaccountApproval.integrationId
                )
            );
    }

    function getCreateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
        bytes32 relayParamsHash = _getRelayParamsHash(relayParams);
        bytes32 subaccountApprovalHash = keccak256(abi.encode(subaccountApproval));

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    account,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList)),
                    relayParamsHash,
                    subaccountApprovalHash
                )
            );
    }

    function getCreateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
        bytes32 relayParamsHash = _getRelayParamsHash(relayParams);

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    address(0),
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList)),
                    relayParamsHash,
                    bytes32(0)
                )
            );
    }

    function _getCreateOrderAddressesStructHash(
        IBaseOrderUtils.CreateOrderParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.cancellationReceiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    addresses.initialCollateralToken,
                    keccak256(abi.encodePacked(addresses.swapPath))
                )
            );
    }

    function _getCreateOrderNumbersStructHash(
        IBaseOrderUtils.CreateOrderParamsNumbers memory numbers
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_NUMBERS_TYPEHASH,
                    numbers.sizeDeltaUsd,
                    numbers.initialCollateralDeltaAmount,
                    numbers.triggerPrice,
                    numbers.acceptablePrice,
                    numbers.executionFee,
                    numbers.callbackGasLimit,
                    numbers.minOutputAmount,
                    numbers.validFromTime
                )
            );
    }

    function getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, bytes32(0), address(0), params);
    }

    function getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, params);
    }

    function _getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    account,
                    _getUpdateOrderParamsStructHash(params),
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getUpdateOrderParamsStructHash(IRelayUtils.UpdateOrderParams calldata params) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_PARAMS_TYPEHASH,
                    params.key,
                    params.sizeDeltaUsd,
                    params.acceptablePrice,
                    params.triggerPrice,
                    params.minOutputAmount,
                    params.validFromTime,
                    params.autoCancel,
                    params.executionFeeIncrease
                )
            );
    }

    function getCancelOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, key);
    }

    function getCancelOrderStructHash(IRelayUtils.RelayParams calldata relayParams, bytes32 key) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, bytes32(0), address(0), key);
    }

    function _getCancelOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        bytes32 key
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CANCEL_ORDER_TYPEHASH,
                    account,
                    key,
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getCreateOrderParamsStructHash(
        IBaseOrderUtils.CreateOrderParams calldata params
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_PARAMS_TYPEHASH,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IRelayUtils.BatchParams calldata params
    ) external pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                keccak256(abi.encode(subaccountApproval)),
                account,
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys
            );
    }

    function getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.BatchParams calldata params
    ) external pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                bytes32(0),
                address(0),
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys
            );
    }

    function _getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        IRelayUtils.UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BATCH_TYPEHASH,
                    account,
                    _getCreateOrderParamsListStructHash(createOrderParamsList),
                    _getUpdateOrderParamsListStructHash(updateOrderParamsList),
                    keccak256(abi.encodePacked(cancelOrderKeys)),
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getCreateOrderParamsListStructHash(
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList
    ) private pure returns (bytes32) {
        bytes32[] memory createOrderParamsStructHashes = new bytes32[](createOrderParamsList.length);
        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            createOrderParamsStructHashes[i] = _getCreateOrderParamsStructHash(createOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(createOrderParamsStructHashes));
    }

    function _getUpdateOrderParamsListStructHash(
        IRelayUtils.UpdateOrderParams[] calldata updateOrderParamsList
    ) private pure returns (bytes32) {
        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = _getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(updateOrderParamsStructHashes));
    }

    //////////////////// MULTICHAIN ////////////////////

    function getTraderReferralCodeStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 referralCode
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SET_TRADER_REFERRAL_CODE_TYPEHASH,
                    referralCode,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getRegisterCodeStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 referralCode
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REGISTER_CODE_TYPEHASH,
                    referralCode,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getClaimFundingFeesStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_FUNDING_FEES_TYPEHASH,
                    keccak256(abi.encodePacked(markets)),
                    keccak256(abi.encodePacked(tokens)),
                    receiver,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getClaimCollateralStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_COLLATERAL_TYPEHASH,
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
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_AFFILIATE_REWARDS_TYPEHASH,
                    keccak256(abi.encodePacked(markets)),
                    keccak256(abi.encodePacked(tokens)),
                    receiver,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function getCreateDepositStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.TransferRequests calldata transferRequests,
        IDepositUtils.CreateDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts)),
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

    function getCreateGlvDepositStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts)),
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

    function getCreateWithdrawalStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.TransferRequests calldata transferRequests,
        IWithdrawalUtils.CreateWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts)),
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

    function getCreateShiftStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.TransferRequests calldata transferRequests,
        IShiftUtils.CreateShiftParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SHIFT_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts)),
                    _getCreateShiftAddressesStructHash(params.addresses),
                    params.minMarketTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList)),
                    _getRelayParamsHash(relayParams)
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

    function getCreateGlvWithdrawalStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_TYPEHASH,
                    keccak256(abi.encodePacked(transferRequests.tokens)),
                    keccak256(abi.encodePacked(transferRequests.receivers)),
                    keccak256(abi.encodePacked(transferRequests.amounts)),
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

    function getBridgeOutStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        IRelayUtils.BridgeOutParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_OUT_TYPEHASH,
                    params.token,
                    params.amount,
                    params.minAmountOut,
                    params.provider,
                    keccak256(abi.encodePacked(params.data)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }
}
