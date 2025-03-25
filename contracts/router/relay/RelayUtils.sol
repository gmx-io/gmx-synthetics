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
    EventEmitter eventEmitter;
    OrderVault orderVault;
    address wnt;
}

struct FeeParams {
    address feeToken;
    uint256 feeAmount;
    address[] feeSwapPath;
}

struct TokenPermit {
    address owner;
    address spender;
    uint256 value;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
    address token;
}

struct ExternalCalls {
    address token;
    uint256 amount;
    address[] externalCallTargets;
    bytes[] externalCallDataList;
    address[] refundTokens;
    address[] refundReceivers;
}

struct RelayParams {
    OracleUtils.SetPricesParams oracleParams;
    ExternalCalls[] externalCallsList;
    TokenPermit[] tokenPermits;
    FeeParams fee;
    uint256 userNonce;
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
    uint256 executionFeeIncrease;
}

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";

string constant CREATE_ORDER_PARAMS_ROOT  = "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode)";
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

    function swapFeeTokens(Contracts memory contracts, Oracle oracle, FeeParams calldata fee) external {
        oracle.validateSequencerUp();

        // swap fee tokens to WNT
        MarketUtils.validateSwapPath(contracts.dataStore, fee.feeSwapPath);
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(contracts.dataStore, fee.feeSwapPath);

        (address outputToken, ) = SwapUtils.swap(
            SwapUtils.SwapParams({
                dataStore: contracts.dataStore,
                eventEmitter: contracts.eventEmitter,
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
                    relayParams.externalCallsList,
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
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) public pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                keccak256(abi.encode(subaccountApproval)),
                account,
                createOrderParamsList,
                updateOrderParamsList,
                cancelOrderKeys
            );
    }

    function getBatchStructHash(
        RelayParams calldata relayParams,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) internal pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                bytes32(0),
                address(0),
                createOrderParamsList,
                updateOrderParamsList,
                cancelOrderKeys
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
