// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";

// @title LiquidationHandler
// @dev Contract to handle liquidations
contract LiquidationHandler is BaseOrderHandler {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        Oracle _oracle,
        SwapHandler _swapHandler,
        FeeReceiver _feeReceiver,
        IReferralStorage _referralStorage
    ) BaseOrderHandler(
        _roleStore,
        _dataStore,
        _eventEmitter,
        _marketStore,
        _orderStore,
        _oracle,
        _swapHandler,
        _feeReceiver,
        _referralStorage
    ) {}

    // @dev executes a position liquidation
    // @param account the account of the position to liquidation
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param oracleParams OracleUtils.SetPricesParams
    function executeLiquidation(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        nonReentrant
        onlyLiquidationKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();

        bytes32 key = LiquidationUtils.createLiquidationOrder(
            dataStore,
            orderStore,
            account,
            market,
            collateralToken,
            isLong
        );

        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, msg.sender, startingGas);

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }
}
