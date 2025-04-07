// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../order/OrderVault.sol";
import "../../oracle/Oracle.sol";
import "../../market/Market.sol";
import "../../swap/SwapUtils.sol";
import "../../order/IBaseOrderUtils.sol";
import {SubaccountApproval} from "../../subaccount/SubaccountUtils.sol";

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
                "SubaccountApproval(address subaccount,bool shouldAdd,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 deadline)"
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

    function getRelayParamsHash(RelayParams calldata relayParams) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    relayParams.oracleParams,
                    relayParams.externalCalls,
                    relayParams.tokenPermits,
                    relayParams.fee,
                    relayParams.userNonce,
                    relayParams.deadline
                )
            );
    }

    function getRemoveSubaccountStructHash(
        RelayParams calldata relayParams,
        address subaccount
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(REMOVE_SUBACCOUNT_TYPEHASH, subaccount, getRelayParamsHash(relayParams)));
    }

    function getSubaccountApprovalStructHash(
        SubaccountApproval calldata subaccountApproval
    ) internal pure returns (bytes32) {
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
                    subaccountApproval.deadline
                )
            );
    }

    function getCreateOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = getRelayParamsHash(relayParams);
        bytes32 subaccountApprovalHash = keccak256(abi.encode(subaccountApproval));

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    account,
                    getCreateOrderAddressesStructHash(params.addresses),
                    getCreateOrderNumbersStructHash(params.numbers),
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
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = getRelayParamsHash(relayParams);

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    address(0),
                    getCreateOrderAddressesStructHash(params.addresses),
                    getCreateOrderNumbersStructHash(params.numbers),
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

    function getCreateOrderAddressesStructHash(
        IBaseOrderUtils.CreateOrderParamsAddresses memory addresses
    ) internal pure returns (bytes32) {
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

    function getCreateOrderNumbersStructHash(
        IBaseOrderUtils.CreateOrderParamsNumbers memory numbers
    ) internal pure returns (bytes32) {
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
    ) internal pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, bytes32(0), address(0), params);
    }

    function getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        UpdateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, params);
    }

    function _getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        UpdateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    account,
                    getUpdateOrderParamsStructHash(params),
                    getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function getUpdateOrderParamsStructHash(UpdateOrderParams calldata params) internal pure returns (bytes32) {
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
    ) internal pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, key);
    }

    function getCancelOrderStructHash(RelayParams calldata relayParams, bytes32 key) internal pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, bytes32(0), address(0), key);
    }

    function _getCancelOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        bytes32 key
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(CANCEL_ORDER_TYPEHASH, account, key, getRelayParamsHash(relayParams), subaccountApprovalHash)
            );
    }

    function getCreateOrderParamsStructHash(
        IBaseOrderUtils.CreateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_PARAMS_TYPEHASH,
                    getCreateOrderAddressesStructHash(params.addresses),
                    getCreateOrderNumbersStructHash(params.numbers),
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
    ) public pure returns (bytes32) {
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
    ) internal pure returns (bytes32) {
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
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BATCH_TYPEHASH,
                    account,
                    getCreateOrderParamsListStructHash(createOrderParamsList),
                    getUpdateOrderParamsListStructHash(updateOrderParamsList),
                    keccak256(abi.encodePacked(cancelOrderKeys)),
                    getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function getCreateOrderParamsListStructHash(
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList
    ) internal pure returns (bytes32) {
        bytes32[] memory createOrderParamsStructHashes = new bytes32[](createOrderParamsList.length);
        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            createOrderParamsStructHashes[i] = getCreateOrderParamsStructHash(createOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(createOrderParamsStructHashes));
    }

    function getUpdateOrderParamsListStructHash(
        UpdateOrderParams[] calldata updateOrderParamsList
    ) internal pure returns (bytes32) {
        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(updateOrderParamsStructHashes));
    }
}
