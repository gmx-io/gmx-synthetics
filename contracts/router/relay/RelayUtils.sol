// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../oracle/OracleUtils.sol";
import "../../order/IBaseOrderUtils.sol";

import "../../deposit/DepositUtils.sol";
import "../../withdrawal/WithdrawalUtils.sol";
import "../../glv/glvDeposit/GlvDepositUtils.sol";
import "../../glv/glvWithdrawal/GlvWithdrawalUtils.sol";
import "../../shift/ShiftUtils.sol";

library RelayUtils {
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
        address[] externalCallTargets;
        bytes[] externalCallDataList;
        address[] refundTokens;
        address[] refundReceivers;
    }

    struct FeeParams {
        address feeToken;
        uint256 feeAmount;
        address[] feeSwapPath;
    }

    struct RelayParams {
        OracleUtils.SetPricesParams oracleParams;
        ExternalCalls externalCalls;
        TokenPermit[] tokenPermits;
        FeeParams fee;
        uint256 userNonce;
        uint256 deadline;
        bytes signature;
        uint256 desChainId;
    }

    // @note all params except account should be part of the corresponding struct hash
    struct UpdateOrderParams {
        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        uint256 triggerPrice;
        uint256 minOutputAmount;
        uint256 validFromTime;
        bool autoCancel;
    }

    struct TransferRequest {
        address token;
        address receiver;
        uint256 amount;
    }

    struct BridgeOutParams {
        address token;
        address account;
        uint256 amount;
    }

    //////////////////// ORDER ////////////////////

    bytes32 public constant UPDATE_ORDER_TYPEHASH =
        keccak256(
            bytes(
                "UpdateOrder(bytes32 key,UpdateOrderParams params,bool increaseExecutionFee,bytes32 relayParams)UpdateOrderParams(uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel)"
            )
        );
    bytes32 public constant UPDATE_ORDER_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "UpdateOrderParams(uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel)"
            )
        );

    bytes32 public constant CANCEL_ORDER_TYPEHASH = keccak256(bytes("CancelOrder(bytes32 key,bytes32 relayParams)"));

    bytes32 public constant CREATE_ORDER_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrder(uint256 collateralDeltaAmount,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32 relayParams)CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime,uint256 srcChainId)"
            )
        );
    bytes32 public constant CREATE_ORDER_NUMBERS_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime,uint256 srcChainId)"
            )
        );
    bytes32 public constant CREATE_ORDER_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)"
            )
        );

    //////////////////// MULTICHAIN ////////////////////

    bytes32 public constant CREATE_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateDeposit(CreateDepositParams params,bytes32 relayParams)CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minMarketTokens,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateDepositParamsAdresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_WITHDRAWAL_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawal(CreateWithdrawalParams params,bytes32 relayParams)CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateWithdrawalParams(address receiver,address callbackContract,address uiFeeReceiver,address market,address[] longTokenSwapPath,address[] shortTokenSwapPath,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant CREATE_GLV_DEPOSIT_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvDeposit(CreateGlvDepositParams params,bytes32 relayParams)CreateGlvDepositParams(address account,address market,address initialLongToken,address initialShortToken,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_GLV_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvDepositParamsAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );
    bytes32 public constant CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvDepositParams(CreateGlvDepositParamsAddresses addresses,uint256 minGlvTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bool shouldUnwrapNativeToken,bool isMarketTokenDeposit,bytes32[] dataList)CreateGlvDepositParamsAddresses(address glv,address market,address receiver,address callbackContract,address uiFeeReceiver,address initialLongToken,address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_GLV_WITHDRAWAL_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvWithdrawal(CreateGlvWithdrawalParams params,bytes32 relayParams)CreateGlvWithdrawalParams(CreateGlvWithdrawalParamsAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)CreateGlvWithdrawalParamsAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );
    bytes32 public constant CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvWithdrawalParams(CreateGlvWithdrawalParamsAddresses addresses,uint256 minLongTokenAmount,uint256 minShortTokenAmount,bool shouldUnwrapNativeToken,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_GLV_WITHDRAWAL_PARAMS_ADDRESSES_TYPEHASH =
        keccak256(
            bytes(
                "CreateGlvWithdrawalParamsAddresses(address receiver,address callbackContract,address uiFeeReceiver,address market,address glv,address[] longTokenSwapPath,address[] shortTokenSwapPath)"
            )
        );

    bytes32 public constant CREATE_SHIFT_TYPEHASH =
        keccak256(
            bytes(
                "CreateShift(CreateShiftParams params,bytes32 relayParams)CreateShiftParams(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );
    bytes32 public constant CREATE_SHIFT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "CreateShiftParams(address receiver,address callbackContract,address uiFeeReceiver,address fromMarket,address toMarket,uint256 minMarketTokens,uint256 executionFee,uint256 callbackGasLimit,uint256 srcChainId,bytes32[] dataList)"
            )
        );

    bytes32 public constant TRANSFER_REQUEST_TYPEHASH =
        keccak256(bytes("TransferRequest(address token,address receiver,uint256 amount)"));

    bytes32 public constant BRIDGE_OUT_TYPEHASH =
        keccak256(
            bytes(
                "BridgeOut(BridgeOutParams params,bytes32 relayParams)BridgeOutParams(address token,uint256 amount)"
            )
        );

    bytes32 public constant BRIDGE_OUT_PARAMS_TYPEHASH =
        keccak256(
            bytes(
                "BridgeOutParams(address token,uint256 amount)"
            )
        );

    //////////////////// ORDER ////////////////////

    function _getRelayParamsHash(RelayParams calldata relayParams) internal pure returns (bytes32) {
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

    function getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 key,
        UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    key,
                    _getUpdateOrderParamsStructHash(params),
                    increaseExecutionFee,
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getUpdateOrderParamsStructHash(UpdateOrderParams calldata params) internal pure returns (bytes32) {
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

    function getCancelOrderStructHash(RelayParams calldata relayParams, bytes32 key) external pure returns (bytes32) {
        return keccak256(abi.encode(CANCEL_ORDER_TYPEHASH, key, _getRelayParamsHash(relayParams)));
    }

    function getCreateOrderStructHash(
        RelayParams calldata relayParams,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
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

    //////////////////// MULTICHAIN ////////////////////

    function getCreateDepositStructHash(
        RelayParams calldata relayParams,
        TransferRequest[] calldata transferRequests,
        DepositUtils.CreateDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_TYPEHASH,
                    _getCreateDepositParamsStructHash(params),
                    _getTransferRequestsHash(transferRequests),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getCreateDepositParamsStructHash(
        DepositUtils.CreateDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_PARAMS_TYPEHASH,
                    _getCreateDepositParamsAdressesStructHash(params.addresses),
                    params.minMarketTokens,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getCreateDepositParamsAdressesStructHash(
        DepositUtils.CreateDepositParamsAdresses memory addresses
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH,
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

    function getCreateWithdrawalStructHash(
        RelayParams calldata relayParams,
        TransferRequest[] calldata transferRequests,
        WithdrawalUtils.CreateWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_TYPEHASH,
                    _getCreateWithdrawalParamsStructHash(params),
                    _getTransferRequestsHash(transferRequests),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getCreateWithdrawalParamsStructHash(
        WithdrawalUtils.CreateWithdrawalParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_WITHDRAWAL_PARAMS_TYPEHASH,
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    params.market,
                    keccak256(abi.encodePacked(params.longTokenSwapPath)),
                    keccak256(abi.encodePacked(params.shortTokenSwapPath)),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function getCreateGlvDepositStructHash(
        RelayParams calldata relayParams,
        TransferRequest[] calldata transferRequests,
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_TYPEHASH,
                    _getCreateGlvDepositParamsStructHash(params),
                    _getTransferRequestsHash(transferRequests),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getCreateGlvDepositParamsStructHash(
        GlvDepositUtils.CreateGlvDepositParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_PARAMS_TYPEHASH,
                    _getCreateGlvDepositParamsAddressesStructHash(params.addresses),
                    params.minGlvTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    params.shouldUnwrapNativeToken,
                    params.isMarketTokenDeposit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getCreateGlvDepositParamsAddressesStructHash(
        GlvDepositUtils.CreateGlvDepositParamsAddresses memory addresses
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_DEPOSIT_PARAMS_ADDRESSES_TYPEHASH,
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

    function getCreateGlvWithdrawalStructHash(
        RelayParams calldata relayParams,
        TransferRequest[] calldata transferRequests,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_TYPEHASH,
                    _getCreateGlvWithdrawalParamsStructHash(params),
                    _getTransferRequestsHash(transferRequests),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getCreateGlvWithdrawalParamsStructHash(
        GlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_PARAMS_TYPEHASH,
                    _getCreateGlvWithdrawalParamsAddressesStructHash(params.addresses),
                    params.minLongTokenAmount,
                    params.minShortTokenAmount,
                    params.shouldUnwrapNativeToken,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getCreateGlvWithdrawalParamsAddressesStructHash(
        GlvWithdrawalUtils.CreateGlvWithdrawalParamsAddresses memory addresses
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_GLV_WITHDRAWAL_PARAMS_ADDRESSES_TYPEHASH,
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

    function getCreateShiftStructHash(
        RelayParams calldata relayParams,
        TransferRequest[] calldata transferRequests,
        ShiftUtils.CreateShiftParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SHIFT_TYPEHASH,
                    _getCreateShiftParamsStructHash(params),
                    _getTransferRequestsHash(transferRequests),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getCreateShiftParamsStructHash(
        ShiftUtils.CreateShiftParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SHIFT_PARAMS_TYPEHASH,
                    params.receiver,
                    params.callbackContract,
                    params.uiFeeReceiver,
                    params.fromMarket,
                    params.toMarket,
                    params.minMarketTokens,
                    params.executionFee,
                    params.callbackGasLimit,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function _getTransferRequestStructHash(TransferRequest memory request) internal pure returns (bytes32) {
        return keccak256(abi.encode(TRANSFER_REQUEST_TYPEHASH, request.token, request.receiver, request.amount));
    }

    // TODO: double-check typehash is correctly generated
    function _getTransferRequestsHash(TransferRequest[] calldata requests) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](requests.length);
        for (uint256 i = 0; i < requests.length; i++) {
            hashes[i] = _getTransferRequestStructHash(requests[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function getBridgeOutStructHash(
        RelayParams calldata relayParams,
        BridgeOutParams memory params
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_OUT_TYPEHASH,
                    _getBridgeOutParamsStructHash(params),
                    _getRelayParamsHash(relayParams)
                )
            );
    }

    function _getBridgeOutParamsStructHash(
        BridgeOutParams memory params
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_OUT_PARAMS_TYPEHASH,
                    params.token,
                    params.amount
                )
            );
    }
}
