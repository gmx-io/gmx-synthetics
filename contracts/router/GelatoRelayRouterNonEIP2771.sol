// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../exchange/IOrderHandler.sol";
import "../order/IBaseOrderUtils.sol";
import "../order/OrderVault.sol";
import "../router/Router.sol";
import "./BaseGelatoRelayRouter.sol";

contract GelatoRelayRouter is BaseGelatoRelayRouter {
    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IOrderHandler _orderHandler,
        OrderVault _orderVault
    ) BaseGelatoRelayRouter(_router, _roleStore, _dataStore, _eventEmitter, _oracle, _orderHandler, _orderVault) {}

    mapping(address => uint256) public userNonces;

    function createOrder(
        RelayParams calldata relayParams,
        uint256 collateralAmount,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params, // can't use calldata because need to modify params.numbers.executionFee
        bytes calldata signature,
        uint256 userNonce,
        uint256 deadline
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) returns (bytes32) {
        bytes32 structHash = _getCreateOrderStructHash(relayParams, collateralAmount, params, userNonce, deadline);
        _handleSignature(structHash, signature, account);
        _handleNonce(account, userNonce);
        _validateDeadline(deadline);

        return _createOrder(relayParams.tokenPermit, relayParams.fee, collateralAmount, params, account);
    }

    function updateOrder(
        RelayParams calldata relayParams,
        bytes32 key,
        address account,
        UpdateOrderParams calldata params,
        bytes calldata signature,
        uint256 userNonce,
        uint256 deadline
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        bytes32 structHash = _getUpdateOrderStructHash(relayParams, key, params, userNonce, deadline);
        _handleSignature(structHash, signature, account);
        _handleNonce(account, userNonce);
        _validateDeadline(deadline);

        _updateOrder(relayParams, account, key, params);
    }

    function cancelOrder(
        RelayParams calldata relayParams,
        bytes32 key,
        address account,
        bytes calldata signature,
        uint256 userNonce,
        uint256 deadline
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelayERC2771 {
        bytes32 structHash = _getCancelOrderStructHash(relayParams, key, userNonce, deadline);
        _handleSignature(structHash, signature, account);
        _handleNonce(account, userNonce);
        _validateDeadline(deadline);

        _cancelOrder(relayParams, account, key);
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (deadline > 0 && block.timestamp > deadline) {
            revert Errors.MultichainDeadlinePassed(block.timestamp, deadline);
        }
    }

    function _handleNonce(address account, uint256 userNonce) internal {
        if (userNonces[account] != 0) {
            revert Errors.InvalidUserNonce(userNonces[account], userNonce);
        }
        userNonces[account] = userNonce;
    }

    function _handleSignature(bytes32 structHash, bytes calldata signature, address account) internal view {
        bytes32 domainSeparator = _getDomainSeparator(block.chainid);
        bytes32 digest = ECDSA.toTypedDataHash(domainSeparator, structHash);
        _validateSignature(digest, signature, account);
    }

    function _getUpdateOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 key,
        UpdateOrderParams calldata params,
        uint256 userNonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "UpdateOrder(bytes32 key,UpdateOrderParams params,uint256 userNonce,uint256 deadline,bytes32 relayParams)"
                        )
                    ),
                    key,
                    _getUpdateOrderParamsStructHash(params),
                    userNonce,
                    deadline,
                    _getRelayParamsStructHash(relayParams)
                )
            );
    }

    function _getUpdateOrderParamsStructHash(UpdateOrderParams calldata params) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "UpdateOrderParams(uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,bool autoCancel)"
                        )
                    ),
                    params.sizeDeltaUsd,
                    params.acceptablePrice,
                    params.triggerPrice,
                    params.minOutputAmount,
                    params.validFromTime,
                    params.autoCancel
                )
            );
    }

    function _getCancelOrderStructHash(
        RelayParams calldata relayParams,
        bytes32 key,
        uint256 userNonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(bytes("CancelOrder(bytes32 key,uint256 userNonce,uint256 deadline,bytes32 relayParams)")),
                    key,
                    userNonce,
                    deadline,
                    _getRelayParamsStructHash(relayParams)
                )
            );
    }

    function _getCreateOrderStructHash(
        RelayParams calldata relayParams,
        uint256 collateralAmount,
        IBaseOrderUtils.CreateOrderParams memory params,
        uint256 userNonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "CreateOrder(uint256 collateralAmount,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,uint256 referralCode,uint256 userNonce,uin256 deadline,bytes32 relayParams)CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)"
                        )
                    ),
                    collateralAmount,
                    _getAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    _getRelayParamsStructHash(relayParams),
                    userNonce,
                    deadline
                )
            );
    }

    function _getCreateOrderNumbersStructHash(
        IBaseOrderUtils.CreateOrderParamsNumbers memory numbers
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)"
                        )
                    ),
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

    function _getAddressesStructHash(
        IBaseOrderUtils.CreateOrderParamsAddresses memory addresses
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)"
                        )
                    ),
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

    function _getRelayParamsStructHash(RelayParams calldata relayParams) internal pure returns (bytes32) {
        return keccak256(abi.encode(relayParams.oracleParams, relayParams.tokenPermit, relayParams.fee));
    }
}
