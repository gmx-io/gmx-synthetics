// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";
import "../liquidation/LiquidationUtils.sol";
import "../order/ExecuteOrderUtils.sol";

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
        Oracle _oracle,
        MultichainVault _multichainVault,
        OrderVault _orderVault,
        SwapHandler _swapHandler,
        IReferralStorage _referralStorage
    ) BaseOrderHandler(
        _roleStore,
        _dataStore,
        _eventEmitter,
        _oracle,
        _multichainVault,
        _orderVault,
        _swapHandler,
        _referralStorage
    ) {}

    // @dev executes a position liquidation
    // @param account the account of the position to liquidate
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
        globalNonReentrant
        onlyLiquidationKeeper
        withOraclePrices(oracleParams)
    {
        uint256 startingGas = gasleft();

        oracle.validateSequencerUp();

        bytes32 key = LiquidationUtils.createLiquidationOrder(
            dataStore,
            eventEmitter,
            account,
            market,
            collateralToken,
            isLong
        );

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);

        BaseOrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(
            key,
            order,
            msg.sender,
            startingGas,
            Order.SecondaryOrderType.None
        );

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeOrderFeatureDisabledKey(address(this), uint256(params.order.orderType())));

        ExecuteOrderUtils.executeOrder(params);
    }
}
