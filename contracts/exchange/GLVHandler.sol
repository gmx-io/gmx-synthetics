// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseHandler.sol";
import "../callback/CallbackUtils.sol";
import "../glv/GLV.sol";

contract GLVHandler is BaseHandler, IDepositCallbackReceiver {
    using Deposit for Deposit.Props;

    GLV public immutable glv;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        GLV _glv
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        glv = _glv;
    }

    function createDeposit() external {
        // TODO: create deposit on behalf of the user
        // TODO: store execution fee
    }

    function afterDepositExecution(bytes32 /* key */, Deposit.Props memory deposit, EventUtils.EventLogData memory /* eventData */) external view {
        if (deposit.receiver() != address(glv)) {
            revert Errors.InvalidGlvDepositReceiver(deposit.receiver(), address(glv));
        }

        /* uint256 marketTokenAmount = glv.recordTransferIn(deposit.market());

        GLVDeposit.Props memory glvDeposit = GLVDeposit.Props(
            deposit.market(),
            marketTokenAmount,
            Chain.currentTimestamp()
        ); */
    }

    function afterDepositCancellation(bytes32 /* key */, Deposit.Props memory /* deposit */, EventUtils.EventLogData memory /* eventData */) external {
        // TODO: refund funds to user
    }

    function issueGlvTokens() external {
        // TODO: calculate the price of GLV based on the current composition of GM tokens in the GLV index
        // TODO: issue the corresponding amount of GLV to the user based on the
    }

    function shift() external {
        // TODO: allow shifting of GM tokens between markets
    }
}
