// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";
import "../callback/CallbackUtils.sol";
import "../exchange/IDepositHandler.sol";

import "../glv/Glv.sol";
import "../glv/GlvVault.sol";

contract GLVHandler is BaseHandler, ReentrancyGuard, IDepositCallbackReceiver, IGasFeeCallbackReceiver {
    using Deposit for Deposit.Props;

    IDepositHandler public immutable depositHandler;
    Glv public immutable glv;
    GlvVault public immutable glvVault;

    struct GlvPreDeposit {
        address account;
        address receiver;
        uint256 executionFee;
    }

    struct GlvDeposit {
        address account;
        address receiver;
        uint256 executionFee;
        address market;
        uint256 marketTokenAmount;
    }

    mapping (bytes32 => GlvPreDeposit) public glvPreDeposits;
    mapping (bytes32 => GlvDeposit) public glvDeposits;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IDepositHandler _depositHandler,
        Glv _glv,
        GlvVault _glvVault
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        depositHandler = _depositHandler;
        glv = _glv;
        glvVault = _glvVault;
    }

    function createDeposit(
        DepositUtils.CreateDepositParams calldata params,
        address receiver
    ) external nonReentrant {
        if (params.receiver != address(glvVault)) {
            revert Errors.InvalidGlvDepositReceiver(params.receiver, address(glvVault));
        }

        if (params.callbackContract != address(this)) {
            revert Errors.InvalidGlvDepositCallbackContract(params.callbackContract, address(this));
        }

        if (params.shouldUnwrapNativeToken != false) {
            revert Errors.GlvDepositUnwrapNativeTokenNotFalse();
        }

        // TODO: validate that deposit.market is part of GLV index

        address wnt = TokenUtils.wnt(dataStore);
        uint256 executionFee = glvVault.recordTransferIn(wnt);

        // TODO: validate min execution fee
        // TODO: validate callback gas limit

        bytes32 key = depositHandler.createDeposit(
            address(this), // account
            params
        );

        glvPreDeposits[key] = GlvPreDeposit(
            msg.sender,
            receiver,
            executionFee
        );
    }

    // @dev the below function assumes that the callback gas limit
    // will be high enough that the function will complete execution
    // without running out of gas
    function afterDepositExecution(
        bytes32 key,
        Deposit.Props memory deposit,
        EventUtils.EventLogData memory /* eventData */
    ) external nonReentrant onlyController {
        GlvPreDeposit memory glvPreDeposit = glvPreDeposits[key];
        if (glvPreDeposit.account == address(0)) {
            revert Errors.EmptyGlvPreDeposit(key);
        }

        delete glvPreDeposits[key];

        uint256 marketTokenAmount = glvVault.recordTransferIn(deposit.market());

        if (marketTokenAmount == 0) {
            return;
        }

        bytes32 glvDepositKey = NonceUtils.getNextKey(dataStore);

        glvDeposits[glvDepositKey] = GlvDeposit(
            glvPreDeposit.account,
            glvPreDeposit.receiver,
            glvPreDeposit.executionFee,
            deposit.market(),
            marketTokenAmount
        );

        dataStore.addBytes32(
            Keys.GLV_DEPOSIT_LIST,
            glvDepositKey
        );

        dataStore.addBytes32(
            Keys.accountGlvDepositListKey(glvPreDeposit.account),
            glvDepositKey
        );

        // TODO: emit event
    }

    // @dev the below function assumes that the callback gas limit
    // will be high enough that the function will complete execution
    // without running out of gas
    function afterDepositCancellation(
        bytes32 key,
        Deposit.Props memory deposit,
        EventUtils.EventLogData memory /* eventData */
    ) external nonReentrant onlyController {
        GlvPreDeposit memory glvPreDeposit = glvPreDeposits[key];

        if (glvPreDeposit.account == address(0)) {
            revert Errors.EmptyGlvPreDeposit(key);
        }

        delete glvPreDeposits[key];

        TokenUtils.transfer(
            dataStore,
            deposit.initialLongToken(),
            glvPreDeposit.account,
            deposit.initialLongTokenAmount()
        );

        TokenUtils.transfer(
            dataStore,
            deposit.initialShortToken(),
            glvPreDeposit.account,
            deposit.initialShortTokenAmount()
        );
    }

    function executeDeposit() external {
        // TODO: calculate the price of GLV based on the current composition of GM tokens in the GLV index
        // TODO: issue the corresponding amount of GLV to the user based on the
    }

    function shift() external {
        // TODO: allow shifting of GM tokens between markets
    }

    function refundExecutionFee(
        bytes32 key,
        EventUtils.EventLogData memory /* eventData */
    ) external payable onlyController {
        address receiver = glvPreDeposits[key].account;

        if (receiver == address(0)) {
            receiver = dataStore.getAddress(Keys.HOLDING_ADDRESS);
        }

        TokenUtils.sendNativeToken(dataStore, receiver, msg.value);
    }
}
