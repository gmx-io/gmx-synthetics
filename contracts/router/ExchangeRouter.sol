// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "../exchange/DepositHandler.sol";
import "../exchange/WithdrawalHandler.sol";
import "../exchange/OrderHandler.sol";

import "./Router.sol";

// for functions which require token transfers from the user
contract ExchangeRouter is ReentrancyGuard, Multicall, RoleModule {
    using SafeERC20 for IERC20;

    Router immutable router;
    DataStore immutable dataStore;
    DepositHandler immutable depositHandler;
    WithdrawalHandler immutable withdrawalHandler;
    OrderHandler immutable orderHandler;
    DepositStore immutable depositStore;
    WithdrawalStore immutable withdrawalStore;
    OrderStore immutable orderStore;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        DepositHandler _depositHandler,
        WithdrawalHandler _withdrawalHandler,
        OrderHandler _orderHandler,
        DepositStore _depositStore,
        WithdrawalStore _withdrawalStore,
        OrderStore _orderStore
    ) RoleModule(_roleStore) {
        router = _router;
        dataStore = _dataStore;

        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        orderHandler = _orderHandler;

        depositStore = _depositStore;
        withdrawalStore = _withdrawalStore;
        orderStore = _orderStore;
    }

    function createDeposit(
        address longToken,
        address shortToken,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        DepositUtils.CreateDepositParams memory params
    ) nonReentrant external payable returns (bytes32) {
        address account = msg.sender;
        address _depositStore = address(depositStore);

        EthUtils.sendWeth(dataStore, _depositStore);

        if (longTokenAmount > 0) {
            router.pluginTransfer(longToken, account, _depositStore, longTokenAmount);
        }
        if (shortTokenAmount > 0) {
            router.pluginTransfer(shortToken, account, _depositStore, shortTokenAmount);
        }

        return depositHandler.createDeposit(
            account,
            params
        );
    }

    function createWithdrawal(
        WithdrawalUtils.CreateWithdrawalParams memory params
    ) nonReentrant external payable returns (bytes32) {
        address account = msg.sender;

        EthUtils.sendWeth(dataStore, address(withdrawalStore));

        return withdrawalHandler.createWithdrawal(
            account,
            params
        );
    }

    function createOrder(
        uint256 amountIn,
        OrderBaseUtils.CreateOrderParams memory params
    ) nonReentrant external payable returns (bytes32) {
        require(params.orderType != Order.OrderType.Liquidation, "ExchangeRouter: invalid order type");

        address account = msg.sender;

        EthUtils.sendWeth(dataStore, address(orderStore));

        if (amountIn > 0) {
            router.pluginTransfer(params.initialCollateralToken, account, address(orderStore), amountIn);
        }

        return orderHandler.createOrder(
            account,
            params
        );
    }

    function createLiquidation(
        OrderBaseUtils.CreateOrderParams memory params,
        address account
    ) nonReentrant external onlyLiquidationKeeper returns (bytes32) {
        require(params.orderType == Order.OrderType.Liquidation, "ExchangeRouter: invalid order type");

        return orderHandler.createOrder(
            account,
            params
        );
    }
}
