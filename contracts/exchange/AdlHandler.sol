// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";

// @title AdlHandler
// @dev Contract to handle adls
contract AdlHandler is BaseOrderHandler {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    // @dev _ExecuteAdlCache struct used in executeAdl to avoid
    // stack too deep errors
    struct _ExecuteAdlCache {
        uint256 startingGas;
        uint256[] oracleBlockNumbers;
        bytes32 key;
        int256 pnlToPoolFactor;
        int256 nextPnlToPoolFactor;
        uint256 maxPnlFactorForWithdrawals;
    }

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
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
        _positionStore,
        _oracle,
        _swapHandler,
        _feeReceiver,
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
        nonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.updateAdlState(
            dataStore,
            eventEmitter,
            marketStore,
            oracle,
            market,
            isLong,
            oracleBlockNumbers
        );
    }

    // @dev auto-deleverages a position
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
        nonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        _ExecuteAdlCache memory cache;

        cache.startingGas = gasleft();

        cache.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.validateAdl(
            dataStore,
            market,
            isLong,
            cache.oracleBlockNumbers
        );

        (bool shouldAllowAdl, , ) = AdlUtils.shouldAllowAdl(
            dataStore,
            marketStore,
            oracle,
            market,
            isLong,
            false
        );

        if (shouldAllowAdl) {
            revert("AdlHandler: ADL not required");
        }

        cache.key = AdlUtils.createAdlOrder(
            AdlUtils.CreateAdlOrderParams(
                dataStore,
                orderStore,
                positionStore,
                account,
                market,
                collateralToken,
                isLong,
                sizeDeltaUsd,
                cache.oracleBlockNumbers[0]
            )
        );

        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(cache.key, oracleParams, msg.sender, cache.startingGas);

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeAdlFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);

        // validate that the ratio of pending pnl to pool value was decreased
        cache.nextPnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, marketStore, oracle, market, isLong, true);
        if (cache.nextPnlToPoolFactor >= cache.pnlToPoolFactor) {
            revert("Invalid adl");
        }

        cache.maxPnlFactorForWithdrawals = MarketUtils.getMaxPnlFactorForWithdrawals(dataStore, market, isLong);

        if (cache.nextPnlToPoolFactor < cache.maxPnlFactorForWithdrawals.toInt256()) {
            revert("Pnl was overcorrected");
        }
    }
}
