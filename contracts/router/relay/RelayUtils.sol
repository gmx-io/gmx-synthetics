// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../order/OrderVault.sol";
import "../../oracle/Oracle.sol";
import "../../oracle/OracleUtils.sol";
import "../../market/Market.sol";
import "../../swap/SwapUtils.sol";
import "../../order/IBaseOrderUtils.sol";
import { SubaccountApproval } from "../../subaccount/SubaccountUtils.sol";

import "../../deposit/DepositUtils.sol";
import "../../glv/glvDeposit/GlvDepositUtils.sol";
import "../../withdrawal/WithdrawalUtils.sol";
import "../../glv/glvWithdrawal/GlvWithdrawalUtils.sol";
import "../../shift/ShiftUtils.sol";

struct Contracts {
    DataStore dataStore;
    OrderVault orderVault;
    address wnt;
}

struct FeeParams {
    // 1. if no swap is needed then `feeToken` should be WNT address, `feeAmount` should be correct amount and `feeSwapPath` should be empty
    // 2. if GMX v2 swap is used to swap relay fee then `feeToken` should be the address of the input token,
    //    `feeAmount` should be the amount of the input token enough to cover the relay fee in WNT, and `feeSwapPath` should be the list of markets
    //    through which the input token should be swapped to get the output token
    // 3. if external calls are used then `feeToken` should be WNT address (even though the input token is different)
    //    `feeAmount` should be 0 because the input token and amount will be specified in `externalCalls`
    //    `feeSwapPath` should be empty
    address feeToken;
    uint256 feeAmount;
    address[] feeSwapPath;
}

struct TokenPermit {
    // EIP-2612 permit https://eips.ethereum.org/EIPS/eip-2612
    address owner;
    address spender;
    uint256 value;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
    address token;
}

// external calls could be used to swap relay fee and/or position collateral
// GMX v2 swaps consume relatively a lot of gas, so using external calls could reduce txn fee
// for relay fee the funds should be sent to the RelayRouter contract
// for position collateral the funds should be sent to the OrderVault contract
//
// @note when using external calls for position collateral and creating multiple orders via `batch()`
// then the funds will be allocated to the first increase order because all external calls are processed first
// and only then OrderVault's balance is used for order's initialCollateralDeltaAmount
//
// @note using external calls for position collateral and atomic swaps for relay fee at the same time should be done with caution
// if position collateral and initial relay fee token are the same then the collateral will be lost
// for example, a user wants to pay ARB to open a position with USDC as collateral and pay USDC as a relay fee
// 1. external calls swap ARB for USDC and sends USDC to the OrderVault to use as position collateral
// 2. USDC is sent to the OrderVault before the swap
// 3. on swap OrderVault.tokenBalances are synced
// 4. on order creation OrderVault.recordTransferInt returns 0
// 5. the collateral is lost
struct ExternalCalls {
    // Gelato Relay Router contracts do not support `multicall` and `sendTokens` methods
    // so all tokens and amounts should be specified here
    address[] sendTokens; // tokens to send to ExternalHandler
    uint256[] sendAmounts; // tokens amounts to send to ExternalHandler
    // lists of external calls to be made
    address[] externalCallTargets; // external targets to call
    bytes[] externalCallDataList; // external call data list
    // refundTokens and refundReceivers are used to send residual funds left in the ExchangeHandler
    // for example, if "swapExactOut" is used some amount of "tokenIn" could be lefts
    address[] refundTokens; // tokens to refund to user
    address[] refundReceivers; // receivers of the refunds
}

struct RelayParams {
    // oracle params are used for relay fee swap through GMX v2 pools
    // if swap is not needed then `oracleParams` values should be empty
    OracleUtils.SetPricesParams oracleParams;
    ExternalCalls externalCalls;
    // token permits could be used to approve spending of tokens by the Router contract
    // instead of sending separate approval transactions
    TokenPermit[] tokenPermits;
    FeeParams fee;
    // should be retrieved from userNonces(account)
    uint256 userNonce;
    // deadline for the transaction. should be used for extra safety so signed message
    // can't be used in future if a user signs and forgets about it
    uint256 deadline;
    bytes signature;
    uint256 desChainId;
}

// @note all params except account should be part of the corresponding struct hash
struct UpdateOrderParams {
    bytes32 key;
    uint256 sizeDeltaUsd;
    uint256 acceptablePrice;
    uint256 triggerPrice;
    uint256 minOutputAmount;
    uint256 validFromTime;
    bool autoCancel;
    // should be non zero if order's execution fee should be increased
    // otherwise should be 0
    uint256 executionFeeIncrease;
}

struct BatchParams {
    IBaseOrderUtils.CreateOrderParams[] createOrderParamsList;
    UpdateOrderParams[] updateOrderParamsList;
    bytes32[] cancelOrderKeys;
}

struct TransferRequests {
    address[] tokens;
    address[] receivers;
    uint256[] amounts;
}

struct BridgeOutParams {
    address token;
    uint256 amount;
    address provider;
    bytes data; // provider specific data e.g. dstEid
}

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";

string constant CREATE_ORDER_PARAMS_ROOT = "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode)";
string constant CREATE_ORDER_PARAMS = string(
    abi.encodePacked(
        "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode)",
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
                "CreateOrder(address account,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32 relayParams,bytes32 subaccountApproval)",
                CREATE_ORDER_ADDRESSES,
                CREATE_ORDER_NUMBERS
            )
        );

    bytes32 public constant SUBACCOUNT_APPROVAL_TYPEHASH =
        keccak256(
            bytes(
                "SubaccountApproval(address subaccount,bool shouldAdd,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 deadline,bytes32 integrationId)"
            )
        );

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
        keccak256(bytes("BridgeOut(address token,uint256 amount,address provider,bytes data,bytes32 relayParams)"));

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

        if (error != ECDSA.RecoverError.NoError || recovered != expectedSigner) {
            revert Errors.InvalidSignature(signatureType);
        }
    }

    function swapFeeTokens(
        Contracts memory contracts,
        EventEmitter eventEmitter,
        Oracle oracle,
        FeeParams calldata fee
    ) external {
        oracle.validateSequencerUp();

        // swap fee tokens to WNT
        MarketUtils.validateSwapPath(contracts.dataStore, fee.feeSwapPath);
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(contracts.dataStore, fee.feeSwapPath);

        (address outputToken, ) = SwapUtils.swap(
            SwapUtils.SwapParams({
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

    function _getRelayParamsHash(RelayParams calldata relayParams) private pure returns (bytes32) {
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
        RelayParams calldata relayParams,
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
                    subaccountApproval.deadline,
                    subaccountApproval.integrationId
                )
            );
    }

    function getCreateOrderStructHash(
        RelayParams calldata relayParams,
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
                    relayParamsHash,
                    subaccountApprovalHash
                )
            );
    }

    function getCreateOrderStructHash(
        RelayParams calldata relayParams,
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
        RelayParams calldata relayParams,
        UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, bytes32(0), address(0), params);
    }

    function getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, params);
    }

    function _getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        UpdateOrderParams calldata params
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

    function _getUpdateOrderParamsStructHash(UpdateOrderParams calldata params) private pure returns (bytes32) {
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
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, key);
    }

    function getCancelOrderStructHash(RelayParams calldata relayParams, bytes32 key) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, bytes32(0), address(0), key);
    }

    function _getCancelOrderStructHash(
        RelayParams calldata relayParams,
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
                    params.referralCode
                )
            );
    }

    function getBatchStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        BatchParams calldata params
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
        RelayParams calldata relayParams,
        BatchParams calldata params
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
        RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
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
        UpdateOrderParams[] calldata updateOrderParamsList
    ) private pure returns (bytes32) {
        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = _getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(updateOrderParamsStructHashes));
    }

    //////////////////// MULTICHAIN ////////////////////

    function getClaimFundingFeesStructHash(
        RelayParams calldata relayParams,
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
        RelayParams calldata relayParams,
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
        RelayParams calldata relayParams,
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
        RelayParams calldata relayParams,
        TransferRequests calldata transferRequests,
        DepositUtils.CreateDepositParams memory params
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
        DepositUtils.CreateDepositParamsAdresses memory addresses
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
        RelayParams calldata relayParams,
        TransferRequests calldata transferRequests,
        GlvDepositUtils.CreateGlvDepositParams memory params
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
        GlvDepositUtils.CreateGlvDepositParamsAddresses memory addresses
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
        RelayParams calldata relayParams,
        TransferRequests calldata transferRequests,
        WithdrawalUtils.CreateWithdrawalParams memory params
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
        WithdrawalUtils.CreateWithdrawalParamsAddresses memory addresses
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
        RelayParams calldata relayParams,
        TransferRequests calldata transferRequests,
        ShiftUtils.CreateShiftParams memory params
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
        ShiftUtils.CreateShiftParamsAddresses memory addresses
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
        RelayParams calldata relayParams,
        TransferRequests calldata transferRequests,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
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
        GlvWithdrawalUtils.CreateGlvWithdrawalParamsAddresses memory addresses
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
        RelayParams calldata relayParams,
        BridgeOutParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_OUT_TYPEHASH,
                    params.token,
                    params.amount,
                    params.provider,
                    keccak256(abi.encodePacked(params.data)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }
}
