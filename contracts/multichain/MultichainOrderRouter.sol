// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";
import "../referral/IReferralStorage.sol";
import "../referral/ITimelock.sol";
import "../referral/IGov.sol";
import "./IMultichainOrderRouter.sol";
import "./MultichainRouter.sol";

contract MultichainOrderRouter is IMultichainOrderRouter, MultichainRouter {
    IReferralStorage public immutable referralStorage;

    constructor(
        BaseConstructorParams memory params,
        IReferralStorage _referralStorage
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        referralStorage = _referralStorage;
    }

    function batch(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.BatchParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32[] memory) {
        bytes32 structHash = RelayUtils.getBatchStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return
            _batch(
                account,
                srcChainId,
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys,
                false // isSubaccount
            );
    }

    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) returns (bytes32) {
        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(account, srcChainId, params, false);
    }

    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.UpdateOrderParams calldata params
    )
        external
        nonReentrant
        withRelay(relayParams, account, srcChainId, false)
    {
        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        _updateOrder(account, params, false);
    }

    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    )
        external
        nonReentrant
        withRelay(relayParams, account, srcChainId, false)
    {
        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _cancelOrder(account, key);
    }

    function setTraderReferralCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getTraderReferralCodeStructHash(relayParams, referralCode);
        _validateCall(relayParams, account, structHash, srcChainId);

        referralStorage.setTraderReferralCode(account, referralCode);
    }

    function registerCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getRegisterCodeStructHash(relayParams, referralCode);
        _validateCall(relayParams, account, structHash, srcChainId);

        // Check if code already exists (govSetCodeOwner doesn't prevent overrides)
        if (referralStorage.codeOwners(referralCode) != address(0)) {
            revert Errors.ReferralCodeAlreadyExists(referralCode);
        }

        ITimelock timelock = ITimelock(IGov(address(referralStorage)).gov());
        // Register code on behalf of the user via timelock keeper access (calls referralStorage.govSetCodeOwner)
        timelock.govSetCodeOwner(address(referralStorage), referralCode, account);
    }
}
