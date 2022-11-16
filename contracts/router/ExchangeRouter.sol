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
    using Order for Order.Props;

    Router immutable router;
    DataStore immutable dataStore;
    EventEmitter immutable eventEmitter;
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
        EventEmitter _eventEmitter,
        DepositHandler _depositHandler,
        WithdrawalHandler _withdrawalHandler,
        OrderHandler _orderHandler,
        DepositStore _depositStore,
        WithdrawalStore _withdrawalStore,
        OrderStore _orderStore
    ) RoleModule(_roleStore) {
        router = _router;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

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
        DepositUtils.CreateDepositParams calldata params
    ) external nonReentrant payable returns (bytes32) {
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
        WithdrawalUtils.CreateWithdrawalParams calldata params
    ) external nonReentrant payable returns (bytes32) {
        address account = msg.sender;

        EthUtils.sendWeth(dataStore, address(withdrawalStore));

        return withdrawalHandler.createWithdrawal(
            account,
            params
        );
    }

    function createOrder(
        uint256 amountIn,
        OrderBaseUtils.CreateOrderParams calldata params
    ) external nonReentrant payable returns (bytes32) {
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

    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 triggerPrice,
        uint256 acceptablePrice
    ) external payable nonReentrant {
        OrderStore _orderStore = orderStore;
        Order.Props memory order = _orderStore.get(key);

        FeatureUtils.validateFeature(dataStore, Keys.updateOrderFeatureKey(address(this), uint256(order.orderType())));

        require(order.account() == msg.sender, "ExchangeRouter: forbidden");

        if (OrderBaseUtils.isMarketOrder(order.orderType())) {
            revert("ExchangeRouter: invalid orderType");
        }

        order.setSizeDeltaUsd(sizeDeltaUsd);
        order.setTriggerPrice(triggerPrice);
        order.setAcceptablePrice(acceptablePrice);
        order.setIsFrozen(false);

        // allow topping up of executionFee as partially filled or frozen orders
        //  will have their executionFee reduced
        uint256 receivedWeth = EthUtils.sendWeth(dataStore, address(_orderStore));
        order.setExecutionFee(order.executionFee() + receivedWeth);

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, order.executionFee());

        order.touch();
        _orderStore.set(key, order);

        eventEmitter.emitOrderUpdated(key, sizeDeltaUsd, triggerPrice, acceptablePrice);
    }

    function cancelOrder(bytes32 key) external nonReentrant {
        uint256 startingGas = gasleft();

        OrderStore _orderStore = orderStore;
        Order.Props memory order = _orderStore.get(key);

        FeatureUtils.validateFeature(dataStore, Keys.cancelOrderFeatureKey(address(this), uint256(order.orderType())));

        require(order.account() == msg.sender, "ExchangeRouter: forbidden");

        if (OrderBaseUtils.isMarketOrder(order.orderType())) {
            revert("ExchangeRouter: invalid orderType");
        }

        OrderUtils.cancelOrder(
            dataStore,
            eventEmitter,
            orderStore,
            key,
            msg.sender,
            startingGas,
            "USER_INITIATED_CANCEL"
        );
    }

    function claimFundingFees(address[] memory markets, address[] memory tokens, address receiver) external nonReentrant {
        if (markets.length != tokens.length) {
            revert("Invalid input");
        }

        address account = msg.sender;

        for (uint256 i = 0; i < markets.length; i++) {
            MarketUtils.claimFundingFees(
                dataStore,
                eventEmitter,
                markets[i],
                tokens[i],
                account,
                receiver
            );
        }
    }
}
