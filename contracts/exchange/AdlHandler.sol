// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";

// @title AdlHandler
// @dev Contract to handle adls
contract AdlHandler is BaseOrderHandler {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Order for Order.Props;
    using Array for uint256[];

    // @dev ExecuteAdlCache struct used in executeAdl to avoid
    // stack too deep errors
    struct ExecuteAdlCache {
        uint256 startingGas;
        bytes32 key;
        bool shouldAllowAdl;
        uint256 maxPnlFactorForAdl;
        int256 pnlToPoolFactor;
        int256 nextPnlToPoolFactor;
        uint256 minPnlFactorForAdl;
    }

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        OrderVault _orderVault,
        SwapHandler _swapHandler,
        IReferralStorage _referralStorage
    ) BaseOrderHandler(
        _roleStore,
        _dataStore,
        _eventEmitter,
        _oracle,
        _orderVault,
        _swapHandler,
        _referralStorage
    ) {}

    // @dev checks the ADL state to update the isAdlEnabled flag
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @param oracleParams OracleUtils.SetPricesParams
    function updateAdlState(
        address market,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyAdlKeeper
        withOraclePrices(oracleParams)
    {
        AdlUtils.updateAdlState(
            dataStore,
            eventEmitter,
            oracle,
            market,
            isLong
        );
    }

    // @dev auto-deleverages a position
    // there is no validation that ADL is executed in order of position profit
    // or position size, this is due to the limitation of the gas overhead
    // required to check this ordering
    //
    // ADL keepers could be separately incentivised using a rebate based on
    // position profit, this is not implemented within the contracts at the moment
    //
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param sizeDeltaUsd the size to reduce the position by
    // @param oracleParams OracleUtils.SetPricesParams
    function executeAdl(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 sizeDeltaUsd,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyAdlKeeper
        withOraclePrices(oracleParams)
    {
        ExecuteAdlCache memory cache;

        cache.startingGas = gasleft();

        AdlUtils.validateAdl(
            dataStore,
            oracle,
            market,
            isLong
        );

        (cache.shouldAllowAdl, cache.pnlToPoolFactor, cache.maxPnlFactorForAdl) = MarketUtils.isPnlFactorExceeded(
            dataStore,
            oracle,
            market,
            isLong,
            Keys.MAX_PNL_FACTOR_FOR_ADL
        );

        if (!cache.shouldAllowAdl) {
            revert Errors.AdlNotRequired(cache.pnlToPoolFactor, cache.maxPnlFactorForAdl);
        }

        cache.key = AdlUtils.createAdlOrder(
            AdlUtils.CreateAdlOrderParams(
                dataStore,
                eventEmitter,
                account,
                market,
                collateralToken,
                isLong,
                sizeDeltaUsd,
                Chain.currentBlockNumber(), // updatedAtBlock
                oracle.minTimestamp() // updatedAtTime
            )
        );

        Order.Props memory order = OrderStoreUtils.get(dataStore, cache.key);

        BaseOrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(
            cache.key,
            order,
            msg.sender,
            cache.startingGas,
            Order.SecondaryOrderType.Adl
        );

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeAdlFeatureDisabledKey(address(this), uint256(params.order.orderType())));

        ExecuteOrderUtils.executeOrder(params);

        // validate that the ratio of pending pnl to pool value was decreased
        cache.nextPnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, oracle, market, isLong, true);
        if (cache.nextPnlToPoolFactor >= cache.pnlToPoolFactor) {
            revert Errors.InvalidAdl(cache.nextPnlToPoolFactor, cache.pnlToPoolFactor);
        }

        cache.minPnlFactorForAdl = MarketUtils.getMinPnlFactorAfterAdl(dataStore, market, isLong);

        if (cache.nextPnlToPoolFactor < cache.minPnlFactorForAdl.toInt256()) {
            revert Errors.PnlOvercorrected(cache.nextPnlToPoolFactor, cache.minPnlFactorForAdl);
        }
    }
}
