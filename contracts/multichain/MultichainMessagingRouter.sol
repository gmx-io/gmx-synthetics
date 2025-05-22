// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../referral/IReferralStorage.sol";

import "./IMultichainMessagingRouter.sol";
import "./MultichainRouter.sol";

contract MultichainMessagingRouter is IMultichainMessagingRouter, MultichainRouter {
    IReferralStorage public immutable referralStorage;

    constructor(
        BaseConstructorParams memory params,
        IReferralStorage _referralStorage
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        referralStorage = _referralStorage;
    }

    function setTraderReferralCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external nonReentrant {
        bytes32 structHash = RelayUtils.getTraderReferralCodeStructHash(relayParams, referralCode);
        _validateCall(relayParams, account, structHash, srcChainId);

        referralStorage.setTraderReferralCode(account, referralCode);
    }
}
