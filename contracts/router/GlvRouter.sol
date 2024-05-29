// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IGlvHandler.sol";
import "../feature/FeatureUtils.sol";
import "../subaccount/SubaccountUtils.sol";
import "../order/OrderVault.sol";
import "../order/OrderStoreUtils.sol";

contract GlvRouter is BaseRouter {
    using GlvDeposit for GlvDeposit.Props;

    IGlvHandler public immutable glvHandler;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IGlvHandler _glvHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        glvHandler = _glvHandler;
    }

    receive() external payable {
        address wnt = TokenUtils.wnt(dataStore);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
        }
    }


    function createGlvDeposit(
        GlvDepositUtils.CreateGlvDepositParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        address account = msg.sender;

        return glvHandler.createGlvDeposit(
            account,
            params
        );
    }

    function cancelGlvDeposit(bytes32 key) external payable nonReentrant {
        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, key);
        if (glvDeposit.account() == address(0)) {
            revert Errors.EmptyDeposit();
        }

        if (glvDeposit.account() != msg.sender) {
            revert Errors.Unauthorized(msg.sender, "account for cancelGlvDeposit");
        }

        glvHandler.cancelGlvDeposit(key);
    }
}

