// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../order/IBaseOrderUtils.sol";
import "../../router/Router.sol";
import "../../feature/FeatureUtils.sol";
import "../../subaccount/SubaccountUtils.sol";
import "./BaseGelatoRelayRouter.sol";

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";

string constant BATCH_CREATE_ORDER_PARAMS = string(
    abi.encodePacked(
        "BatchCreateOrderParams(uint256 collateralDeltaAmount,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS
    )
);

contract SubaccountGelatoRelayRouter is BaseGelatoRelayRouter {
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
    bytes32 public constant CREATE_ORDER_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "CreateOrder(uint256 collateralDeltaAmount,address account,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32 relayParams,bytes32 subaccountApproval)",
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

    bytes32 public constant BATCH_CREATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(BATCH_CREATE_ORDER_PARAMS));
    bytes32 public constant BATCH_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Batch(address account,BatchCreateOrderParams[] batchCreateOrderParamsList,UpdateOrderParams[] updateOrderParamsList,bytes32[] cancelOrderKeys,bytes32 relayParams,bytes32 subaccountApproval)",
                BATCH_CREATE_ORDER_PARAMS,
                UPDATE_ORDER_PARAMS
            )
        );

    mapping(address => uint256) public subaccountApprovalNonces;

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

    struct BatchVars {
        uint256 startingGas;
        uint256 actionsCount;
        bytes32 structHash;
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function batch(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        address subaccount,
        BatchCreateOrderParams[] calldata batchCreateOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        BatchVars memory vars;
        vars.startingGas = gasleft();

        _validateGaslessFeature();
        vars.structHash = _getBatchStructHash(
            relayParams,
            subaccountApproval,
            account,
            batchCreateOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys
        );
        _validateCall(relayParams, subaccount, vars.structHash);

        for (uint256 i = 0; i < batchCreateOrderParamsList.length; i++) {
            _validateCreateOrderParams(account, batchCreateOrderParamsList[i].params);
        }

        vars.actionsCount = batchCreateOrderParamsList.length + updateOrderParamsList.length + cancelOrderKeys.length;
        if (vars.actionsCount == 0) {
            revert Errors.RelayEmptyBatch();
        }

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, vars.actionsCount, subaccountApproval);

        _batch(
            relayParams,
            account,
            batchCreateOrderParamsList,
            updateOrderParamsList,
            cancelOrderKeys,
            false, // isSubaccount
            vars.startingGas
        );
    }

    function _validateCreateOrderParams(
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure {
        if (params.addresses.receiver != account) {
            revert Errors.InvalidReceiver(params.addresses.receiver);
        }

        if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
            revert Errors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
        }
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function createOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) returns (bytes32) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getCreateOrderStructHash(
            relayParams,
            subaccountApproval,
            account,
            collateralDeltaAmount,
            params
        );
        _validateCall(relayParams, subaccount, structHash);
        _validateCreateOrderParams(account, params);

        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);

        return
            _createOrder(
                relayParams,
                account,
                collateralDeltaAmount,
                params,
                true, // isSubaccount
                startingGas
            );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function updateOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        UpdateOrderParams calldata params
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getUpdateOrderStructHash(relayParams, subaccountApproval, account, params);
        _validateCall(relayParams, subaccount, structHash);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _updateOrder(
            relayParams,
            account,
            params,
            true, // isSubaccount
            startingGas
        );
    }

    // @note all params except subaccount should be part of the corresponding struct hash
    function cancelOrder(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account, // main account
        address subaccount,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getCancelOrderStructHash(relayParams, subaccountApproval, account, key);
        _validateCall(relayParams, subaccount, structHash);
        _handleSubaccountAction(account, subaccount, Keys.SUBACCOUNT_ORDER_ACTION, 1, subaccountApproval);
        _cancelOrder(
            relayParams,
            account,
            key,
            true, // isSubaccount
            startingGas
        );
    }

    // @note all params except account should be part of the corresponding struct hash
    function removeSubaccount(
        RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) {
        uint256 startingGas = gasleft();
        _validateGaslessFeature();
        bytes32 structHash = _getRemoveSubaccountStructHash(relayParams, subaccount);
        _validateCall(relayParams, account, structHash);

        Contracts memory contracts = _getContracts();
        uint256 residualFeeAmount = _handleRelayBeforeAction(
            contracts,
            relayParams,
            account,
            false // isSubaccount is false because the `removeSubaccount` call is signed by the main account
        );

        SubaccountUtils.removeSubaccount(dataStore, eventEmitter, account, subaccount);

        _handleRelayAfterAction(
            contracts,
            startingGas,
            residualFeeAmount,
            account,
            relayParams.oracleParams.tokens.length
        );
    }

    function _handleSubaccountAction(
        address account,
        address subaccount,
        bytes32 actionType,
        uint256 actionsCount,
        SubaccountApproval calldata subaccountApproval
    ) internal {
        FeatureUtils.validateFeature(dataStore, Keys.subaccountFeatureDisabledKey(address(this)));

        _handleSubaccountApproval(account, subaccountApproval);

        SubaccountUtils.handleSubaccountAction(dataStore, eventEmitter, account, subaccount, actionType, actionsCount);
    }

    function _handleSubaccountApproval(address account, SubaccountApproval calldata subaccountApproval) internal {
        if (subaccountApproval.signature.length == 0) {
            return;
        }

        if (subaccountApproval.subaccount == address(0)) {
            revert Errors.InvalidSubaccountApprovalSubaccount();
        }

        if (block.timestamp > subaccountApproval.deadline) {
            revert Errors.SubaccountApprovalDeadlinePassed(block.timestamp, subaccountApproval.deadline);
        }

        uint256 storedNonce = subaccountApprovalNonces[account];
        if (storedNonce != subaccountApproval.nonce) {
            revert Errors.InvalidSubaccountApprovalNonce(storedNonce, subaccountApproval.nonce);
        }
        subaccountApprovalNonces[account] = storedNonce + 1;

        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 structHash = _getSubaccountApprovalStructHash(subaccountApproval);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, subaccountApproval.signature, account, "subaccount approval");

        SubaccountUtils.handleSubaccountApproval(dataStore, eventEmitter, account, subaccountApproval);
    }

    function _getRemoveSubaccountStructHash(
        RelayParams calldata relayParams,
        address subaccount
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(REMOVE_SUBACCOUNT_TYPEHASH, subaccount, _getRelayParamsHash(relayParams)));
    }

    function _getSubaccountApprovalStructHash(
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

    function _getCreateOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params
    ) internal pure returns (bytes32) {
        bytes32 relayParamsHash = _getRelayParamsHash(relayParams);
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

    function _getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        UpdateOrderParams calldata params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    account,
                    _getUpdateOrderParamsStructHash(params),
                    _getRelayParamsHash(relayParams),
                    keccak256(abi.encode(subaccountApproval))
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

    function _getCancelOrderStructHash(
        RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CANCEL_ORDER_TYPEHASH,
                    account,
                    key,
                    _getRelayParamsHash(relayParams),
                    keccak256(abi.encode(subaccountApproval))
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
        SubaccountApproval calldata subaccountApproval,
        address account,
        BatchCreateOrderParams[] calldata batchCreateOrderParamsList,
        UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BATCH_TYPEHASH,
                    account,
                    _getBatchCreateOrderParamsListStructHash(batchCreateOrderParamsList),
                    _getUpdateOrderParamsListStructHash(updateOrderParamsList),
                    keccak256(abi.encodePacked(cancelOrderKeys)),
                    _getRelayParamsHash(relayParams),
                    keccak256(abi.encode(subaccountApproval))
                )
            );
    }

    function _getBatchCreateOrderParamsListStructHash(
        BatchCreateOrderParams[] calldata batchCreateOrderParamsList
    ) internal pure returns (bytes32) {
        bytes32[] memory batchCreateOrderStructHashes = new bytes32[](batchCreateOrderParamsList.length);
        for (uint256 i = 0; i < batchCreateOrderParamsList.length; i++) {
            batchCreateOrderStructHashes[i] = _getBatchCreateOrderStructHash(batchCreateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(batchCreateOrderStructHashes));
    }

    function _getUpdateOrderParamsListStructHash(
        UpdateOrderParams[] calldata updateOrderParamsList
    ) internal pure returns (bytes32) {
        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = _getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(updateOrderParamsStructHashes));
    }
}
