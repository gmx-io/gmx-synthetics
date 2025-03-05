// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../order/IBaseOrderUtils.sol";
import "../../router/Router.sol";
import "../../feature/FeatureUtils.sol";
import "../../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";

library SubaccountRelayUtils {
    using Order for Order.Props;

    struct SubaccountApproval {
        address subaccount;
        bool shouldAdd;
        uint256 expiresAt;
        uint256 maxAllowedCount;
        bytes32 actionType;
        uint256 nonce; // for replay attack protection
        uint256 deadline;
        bytes signature;
    }

    bytes32 public constant UPDATE_ORDER_TYPEHASH =
        keccak256(
            bytes(
                "UpdateOrder(address account,bytes32 key,UpdateOrderParams params,bool increaseExecutionFee,bytes32 relayParams,bytes32 subaccountApproval)UpdateOrderParams(uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel)"
            )
        );
    bytes32 public constant UPDATE_ORDER_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "UpdateOrderParams(uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel)"
            )
        );

    bytes32 public constant CANCEL_ORDER_TYPEHASH =
        keccak256(bytes("CancelOrder(address account,bytes32 key,bytes32 relayParams,bytes32 subaccountApproval)"));

    bytes32 public constant CREATE_ORDER_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrder(uint256 collateralDeltaAmount,address account,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList,bytes32 relayParams,bytes32 subaccountApproval)CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)"
            )
        );
    bytes32 public constant CREATE_ORDER_NUMBERS_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)"
            )
        );
    bytes32 public constant CREATE_ORDER_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)"
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

    function getRemoveSubaccountStructHash(
        RelayUtils.RelayParams calldata relayParams,
        address subaccount
    ) external pure returns (bytes32) {
        return
            keccak256(abi.encode(REMOVE_SUBACCOUNT_TYPEHASH, subaccount, RelayUtils._getRelayParamsHash(relayParams)));
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
                    subaccountApproval.deadline
                )
            );
    }

    function getCreateOrderStructHash(
        RelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
        bytes32 relayParamsHash = RelayUtils._getRelayParamsHash(relayParams);
        bytes32 subaccountApprovalHash = keccak256(abi.encode(subaccountApproval));

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    collateralDeltaAmount,
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

    function _getCreateOrderAddressesStructHash(
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

    function _getCreateOrderNumbersStructHash(
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
        RelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    account,
                    key,
                    _getUpdateOrderParamsStructHash(params),
                    increaseExecutionFee,
                    RelayUtils._getRelayParamsHash(relayParams),
                    keccak256(abi.encode(subaccountApproval))
                )
            );
    }

    function _getUpdateOrderParamsStructHash(
        RelayUtils.UpdateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_PARAMS_TYPEHASH,
                    params.sizeDeltaUsd,
                    params.acceptablePrice,
                    params.triggerPrice,
                    params.minOutputAmount,
                    params.validFromTime,
                    params.autoCancel
                )
            );
    }

    function getCancelOrderStructHash(
        RelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CANCEL_ORDER_TYPEHASH,
                    account,
                    key,
                    RelayUtils._getRelayParamsHash(relayParams),
                    keccak256(abi.encode(subaccountApproval))
                )
            );
    }
}
