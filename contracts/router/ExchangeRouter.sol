// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../exchange/DepositHandler.sol";
import "../exchange/WithdrawalHandler.sol";
import "../exchange/OrderHandler.sol";

import "./Router.sol";

// for functions which require token transfers from the user
contract ExchangeRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    Router public router;
    DataStore public dataStore;
    DepositHandler public depositHandler;
    WithdrawalHandler public withdrawalHandler;
    OrderHandler public orderHandler;
    DepositStore public depositStore;
    WithdrawalStore public withdrawalStore;
    OrderStore public orderStore;

    constructor(
        Router _router,
        DataStore _dataStore,
        DepositHandler _depositHandler,
        WithdrawalHandler _withdrawalHandler,
        OrderHandler _orderHandler,
        DepositStore _depositStore,
        WithdrawalStore _withdrawalStore,
        OrderStore _orderStore
    ) {
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
        address _market,
        address longToken,
        address shortToken,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        uint256 minMarketTokens,
        bool hasCollateralInETH,
        uint256 executionFee
    ) nonReentrant external payable returns (bytes32) {
        address account = msg.sender;
        address _depositStore = address(depositStore);

        _sendWeth(_depositStore);

        if (longTokenAmount > 0) {
            router.pluginTransfer(longToken, account, _depositStore, longTokenAmount);
        }
        if (shortTokenAmount > 0) {
            router.pluginTransfer(shortToken, account, _depositStore, shortTokenAmount);
        }

        return depositHandler.createDeposit(
            account,
            _market,
            minMarketTokens,
            hasCollateralInETH,
            executionFee
        );
    }

    function createWithdrawal(
        address market,
        uint256 marketTokensLongAmount,
        uint256 marketTokensShortAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        bool hasCollateralInETH,
        uint256 executionFee
    ) nonReentrant external payable returns (bytes32) {
        address account = msg.sender;

        _sendWeth(address(withdrawalStore));

        return withdrawalHandler.createWithdrawal(
            account,
            market,
            marketTokensLongAmount,
            marketTokensShortAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            hasCollateralInETH,
            executionFee
        );
    }

    function createOrder(
        OrderUtils.CreateOrderParams memory params,
        uint256 amountIn
    ) nonReentrant external payable returns (bytes32) {
        address account = msg.sender;

        _sendWeth(address(orderStore));

        if (amountIn > 0) {
            router.pluginTransfer(params.initialCollateralToken, account, address(orderStore), amountIn);
        }

        return orderHandler.createOrder(
            account,
            params
        );
    }

    function _sendWeth(address receiver) internal {
        address weth = EthUtils.weth(dataStore);
        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).safeTransfer(address(receiver), msg.value);
    }
}
