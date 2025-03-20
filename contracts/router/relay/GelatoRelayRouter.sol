// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../event/EventEmitter.sol";
import "../../exchange/IOrderHandler.sol";
import "../../order/IBaseOrderUtils.sol";
import "../../order/OrderVault.sol";
import "../../router/Router.sol";
import "./BaseGelatoRelayRouter.sol";

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";
string constant CREATE_ORDER = string(
    abi.encodePacked(
        "CreateOrder(uint256 collateralDeltaAmount,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32 relayParams)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS
    )
);

string constant BATCH_CREATE_ORDER_PARAMS = string(
    abi.encodePacked(
        "BatchCreateOrderParams(uint256 collateralDeltaAmount,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS
    )
);

contract GelatoRelayRouter is BaseGelatoRelayRouter {
    bytes32 public constant UPDATE_ORDER_TYPEHASH =
        keccak256(abi.encodePacked("UpdateOrder(UpdateOrderParams params,bytes32 relayParams)", UPDATE_ORDER_PARAMS));
    bytes32 public constant UPDATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(UPDATE_ORDER_PARAMS));

    bytes32 public constant CANCEL_ORDER_TYPEHASH = keccak256(bytes("CancelOrder(bytes32 key,bytes32 relayParams)"));

    bytes32 public constant CREATE_ORDER_TYPEHASH = keccak256(bytes(CREATE_ORDER));
    bytes32 public constant CREATE_ORDER_NUMBERS_TYPEHASH = keccak256(bytes(CREATE_ORDER_NUMBERS));
    bytes32 public constant CREATE_ORDER_ADDRESSES_TYPEHASH = keccak256(bytes(CREATE_ORDER_ADDRESSES));

    bytes32 public constant BATCH_CREATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(BATCH_CREATE_ORDER_PARAMS));
    bytes32 public constant BATCH_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Batch(BatchCreateOrderParams[] batchCreateOrderParamsList,UpdateOrderParams[] updateOrderParamsList,bytes32[] cancelOrderKeys,bytes32 relayParams)",
                BATCH_CREATE_ORDER_PARAMS,
                UPDATE_ORDER_PARAMS
            )
        );

    constructor(
        Router _router,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault,
        IExternalHandler _externalHandler
    )
        BaseGelatoRelayRouter(_router, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault, _externalHandler)
    {}

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        address account,
        BatchCreateOrderParams[] calldata batchCreateOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getBatchStructHash(
            relayParams,
            batchCreateOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys
        );
        _validateCall(relayParams, account, structHash);

        _batch(
            relayParams,
            account,
            batchCreateOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys,
            false, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        address account,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) returns (bytes32) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getCreateOrderStructHash(relayParams, collateralDeltaAmount, params);
        _validateCall(relayParams, account, structHash);

        return
            _createOrder(
                relayParams,
                account,
                collateralDeltaAmount,
                params,
                false, // isSubaccount
                startingGas
            );
    }

    // @note all params except account should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        address account,
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash);

        _updateOrder(
            relayParams,
            account,
            params,
            false, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        address account,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash);

        _cancelOrder(
            relayParams,
            account,
            key,
            false, // isSubaccount
            startingGas
        );
    }

    function _getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        UpdateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    _getUpdateOrderParamsStructHash(params),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getUpdateOrderParamsStructHash(UpdateOrderParams calldata params) internal pure returns (bytes32) {
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

    function _getCancelOrderStructHash(RelayParams calldata relayParams, bytes32 key) internal pure returns (bytes32) {
        return keccak256(abi.encode(CANCEL_ORDER_TYPEHASH, key, _getRelayParamsHash(relayParams)));
    }

    function _getCreateOrderStructHash(
        RelayParams calldata relayParams,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    collateralDeltaAmount,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    _getRelayParamsHash(relayParams)
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

    function _getBatchCreateOrderStructHash(BatchCreateOrderParams calldata params) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BATCH_CREATE_ORDER_PARAMS_TYPEHASH,
                    params.collateralDeltaAmount,
                    _getCreateOrderAddressesStructHash(params.params.addresses),
                    _getCreateOrderNumbersStructHash(params.params.numbers),
                    uint256(params.params.orderType),
                    uint256(params.params.decreasePositionSwapType),
                    params.params.isLong,
                    params.params.shouldUnwrapNativeToken,
                    params.params.autoCancel,
                    params.params.referralCode
                )
            );
    }

    function _getBatchStructHash(
        RelayParams calldata relayParams,
        BatchCreateOrderParams[] calldata batchCreateOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) internal pure returns (bytes32) {
        bytes32[] memory batchCreateOrderStructHashes = new bytes32[](batchCreateOrderParamsList.length);
        for (uint256 i = 0; i < batchCreateOrderParamsList.length; i++) {
            batchCreateOrderStructHashes[i] = _getBatchCreateOrderStructHash(batchCreateOrderParamsList[i]);
        }

        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = _getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }

        return
            keccak256(
                abi.encode(
                    BATCH_TYPEHASH,
                    keccak256(abi.encodePacked(batchCreateOrderStructHashes)),
                    keccak256(abi.encodePacked(updateOrderParamsStructHashes)),
                    keccak256(abi.encodePacked(cancelOrderKeys)),
                    _getRelayParamsHash(relayParams)
                )
            );
    }
}
